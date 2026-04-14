const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { hmacMiddleware } = require('../middleware/hmac');
const { verifyGateTOTP } = require('../utils/totp');
const { verifyGeofence } = require('../utils/geofence');
const { getGateSecretFromCache } = require('../utils/redis');

/**
 * POST /auth/enroll
 *
 * Called ONCE when a student installs the app and registers their device.
 * The server provisions a unique HMAC secret for this device and returns it.
 * The secret is stored in the device's Android KeyStore / iOS KeyChain.
 *
 * Body: { roll_number, device_fingerprint, platform, model }
 */
router.post('/enroll', async (req, res) => {
  const { roll_number, device_fingerprint, platform, model, embedding_hash } = req.body;

  if (!roll_number || !device_fingerprint) {
    return res.status(400).json({ error: 'ENROLL_MISSING_FIELDS' });
  }

  try {
    // Check user exists
    const userResult = await pool.query(
      `SELECT id, is_active FROM sentinel.users WHERE roll_number = $1`,
      [roll_number]
    );
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'ENROLL_USER_NOT_FOUND' });
    }
    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'ENROLL_USER_INACTIVE' });
    }

    // Check if device already enrolled
    const existingDevice = await pool.query(
      `SELECT id FROM sentinel.devices WHERE device_fingerprint = $1`,
      [device_fingerprint]
    );
    if (existingDevice.rowCount > 0) {
      return res.status(409).json({ error: 'ENROLL_DEVICE_ALREADY_REGISTERED' });
    }

    // Generate a strong per-device HMAC secret (32 bytes = 64 hex chars)
    const hmacSecret = crypto.randomBytes(32).toString('hex');

    // Insert device
    const deviceResult = await pool.query(
      `INSERT INTO sentinel.devices
         (user_id, device_fingerprint, hmac_secret_enc, platform, model)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [user.id, device_fingerprint, hmacSecret, platform, model]
    );

    // Store biometric baseline hash if provided
    if (embedding_hash) {
      await pool.query(
        `INSERT INTO sentinel.biometric_baselines (user_id, embedding_hash)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET embedding_hash = $2, updated_at = NOW()`,
        [user.id, embedding_hash]
      );
    }

    // Initialize presence record
    await pool.query(
      `INSERT INTO sentinel.student_presence (user_id, current_status)
       VALUES ($1, 'IN')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    return res.status(201).json({
      device_id:   deviceResult.rows[0].id,
      hmac_secret: hmacSecret,    // returned ONCE — device must store in secure enclave
      message:     'Device enrolled. Store the hmac_secret in Android KeyStore immediately.',
    });
  } catch (err) {
    console.error('[Enroll]', err.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /auth/event
 *
 * THE CORE ENDPOINT — receives authentication events from the student app.
 *
 * ── FLOW ──────────────────────────────────────────────────────────────────
 * 1. Flutter app scans gate QR → reads: { gate_id, geo_id, totp, window, mode }
 * 2. App verifies GPS is inside geofence_id (local check)
 * 3. App runs MediaPipe face PAD → gets liveness_score + embedding_hash
 * 4. App packages payload + signs with HMAC-SHA256 → submits here
 * 5. App commits to local SQLite immediately (offline-first) → UI shows OK
 * 6. WorkManager syncs to server in background → this endpoint receives it
 *
 * ── WHAT THE SERVER VERIFIES ─────────────────────────────────────────────
 * A. HMAC signature (middleware runs first)
 * B. TOTP value against gate's secret for claimed window
 * C. GPS coordinates against PostGIS geofence
 * D. Liveness score threshold (>= 0.75 pass)
 * E. Combined decision → GRANTED / REJECTED
 * F. Write to auth_events + update student_presence
 * G. Notify FastAPI ML worker asynchronously
 *
 * Body (from student app):
 * {
 *   gate_id:          "G-01",
 *   geofence_id:      "HOSTEL_A",
 *   totp_value:       "482913",     -- 6-digit from QR
 *   totp_window:      92847,        -- window number from QR
 *   gps_lat:          23.5204,
 *   gps_lng:          77.8038,
 *   liveness_score:   0.9312,       -- from MediaPipe PAD (0–1)
 *   embedding_hash:   "sha256hex",  -- hash of face embedding (not the embedding)
 *   direction:        "OUT",        -- IN or OUT
 *   client_ts:        1718123456789 -- device timestamp (ms)
 * }
 */
router.post('/event', hmacMiddleware, async (req, res) => {
  const {
    gate_id, geofence_id,
    totp_value, totp_window,
    gps_lat, gps_lng,
    liveness_score, embedding_hash,
    direction, client_ts,
  } = req.body;

  const { device } = req; // set by hmacMiddleware

  // ── Validate required fields ────────────────────────────────────────────
  if (!gate_id || !totp_value || !totp_window || !gps_lat || !gps_lng || !liveness_score) {
    return res.status(400).json({ error: 'AUTH_MISSING_FIELDS' });
  }

  let status = 'GRANTED';
  let rejectionReason = null;
  const decisions = { totp: false, gps: false, liveness: false };

  try {
    // ── A. Fetch gate + its mode ───────────────────────────────────────────
    const gateResult = await pool.query(
      `SELECT id, status, mfa_mode, totp_secret_enc, geofence_id
       FROM sentinel.gates WHERE id = $1`,
      [gate_id]
    );
    if (gateResult.rowCount === 0) {
      return res.status(404).json({ error: 'AUTH_GATE_NOT_FOUND' });
    }
    const gate = gateResult.rows[0];

    if (gate.status === 'LOCKED') {
      return res.status(403).json({ error: 'AUTH_GATE_LOCKED' });
    }

    // Verify submitted geofence_id matches gate's configured zone
    if (geofence_id !== gate.geofence_id) {
      return res.status(400).json({ error: 'AUTH_GEOFENCE_MISMATCH' });
    }

    // ── B. Verify TOTP ────────────────────────────────────────────────────
    let gateSecret = await getGateSecretFromCache(gate_id);
    if (!gateSecret) {
      gateSecret = gate.totp_secret_enc; // fallback to DB
    }

    const totpResult = verifyGateTOTP(gateSecret, totp_value, parseInt(totp_window));
    decisions.totp = totpResult.valid;

    if (!totpResult.valid) {
      status = 'REJECTED';
      rejectionReason = `TOTP_INVALID:${totpResult.reason || 'mismatch'}`;
    }

    // ── C. Verify GPS geofence ────────────────────────────────────────────
    const geoResult = await verifyGeofence(
      geofence_id,
      parseFloat(gps_lat),
      parseFloat(gps_lng)
    );
    decisions.gps = geoResult.inFence;

    if (!geoResult.inFence && gate.mfa_mode === 'FULL') {
      status = 'REJECTED';
      rejectionReason = rejectionReason || `GPS_OUT_OF_FENCE:${geoResult.distanceMeters}m`;
    }

    // ── D. Verify liveness score ──────────────────────────────────────────
    const livenessThreshold = gate.mfa_mode === 'FULL' ? 0.75 : 0.60;
    const livenessFloat = parseFloat(liveness_score);
    decisions.liveness = livenessFloat >= livenessThreshold;

    if (!decisions.liveness && gate.mfa_mode !== 'TOTP_ONLY') {
      status = 'REJECTED';
      rejectionReason = rejectionReason || `LIVENESS_BELOW_THRESHOLD:${livenessFloat}`;
    }

    // ── E. Write auth event to DB ─────────────────────────────────────────
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body))
      .digest('hex');

    const eventResult = await pool.query(
      `INSERT INTO sentinel.auth_events (
         user_id, device_id, student_roll,
         gate_id, geofence_id,
         client_ts, totp_window,
         payload_hash,
         totp_valid, gps_lat, gps_lng, gps_in_fence, gps_distance_m,
         liveness_score, liveness_pass,
         status, rejection_reason,
         hmac_valid, direction,
         mfa_mode_used
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         to_timestamp($6 / 1000.0), $7,
         $8,
         $9, $10, $11, $12, $13,
         $14, $15,
         $16, $17,
         TRUE, $18, $19
       ) RETURNING id`,
      [
        device.userId, device.id, device.rollNumber,
        gate_id, geofence_id,
        client_ts || Date.now(), totp_window,
        payloadHash,
        decisions.totp, gps_lat, gps_lng, geoResult.inFence, geoResult.distanceMeters,
        livenessFloat, decisions.liveness,
        status, rejectionReason,
        direction || 'OUT',
        gate.mfa_mode,
      ]
    );

    const eventId = eventResult.rows[0].id;

    // ── F. Update student presence ─────────────────────────────────────────
    if (status === 'GRANTED') {
      await pool.query(
        `INSERT INTO sentinel.student_presence (user_id, current_status, last_gate_id, last_event_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           current_status = $2, last_gate_id = $3, last_event_id = $4, updated_at = NOW()`,
        [device.userId, direction || 'OUT', gate_id, eventId]
      );
    }

    // ── G. Notify ML worker asynchronously (fire and forget) ───────────────
    // Node.js NEVER awaits this — ML worker reads from PostgreSQL independently
    // This just writes a lightweight notification row
    pool.query(
      `INSERT INTO sentinel.sync_outbox (device_id, raw_payload, status)
       VALUES ($1, $2, 'PENDING')`,
      [device.id, JSON.stringify({ event_id: eventId, type: 'ml_audit' })]
    ).catch(e => console.error('[ML notify]', e.message));

    // ── H. Broadcast to SSE clients (admin dashboard live feed) ────────────
    global.sseNotify?.('auth_event', {
      id:           eventId,
      student_roll: device.rollNumber,
      gate_id,
      status,
      liveness_score: livenessFloat,
      gps_in_fence: geoResult.inFence,
      totp_valid:   decisions.totp,
      direction:    direction || 'OUT',
      rejection_reason: rejectionReason,
    });

    // ── Update gate queue metrics (lightweight) ────────────────────────────
    pool.query(
      `UPDATE sentinel.gates SET
         current_lambda = LEAST(current_lambda + 1, 999),
         updated_at = NOW()
       WHERE id = $1`,
      [gate_id]
    ).catch(() => {});

    return res.json({
      event_id: eventId,
      status,
      decisions,
      rejection_reason: rejectionReason,
      server_ts: Date.now(),
    });

  } catch (err) {
    console.error('[Auth Event]', err.message, err.stack);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /auth/sync-batch
 *
 * WorkManager may queue multiple events when offline.
 * This accepts a batch from the outbox and processes each event.
 */
router.post('/sync-batch', hmacMiddleware, async (req, res) => {
  const { events } = req.body;
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'SYNC_EMPTY_BATCH' });
  }
  if (events.length > 50) {
    return res.status(400).json({ error: 'SYNC_BATCH_TOO_LARGE' });
  }

  const { device } = req;
  const results = [];

  for (const event of events) {
    try {
      const {
        gate_id, geofence_id,
        totp_value, totp_window,
        gps_lat, gps_lng,
        liveness_score, embedding_hash,
        direction, client_ts,
      } = event;

      // Validate required fields
      if (!gate_id || !totp_value || !totp_window || !gps_lat || !gps_lng || !liveness_score) {
        results.push({ client_event_id: event.local_id, status: 'FAILED', error: 'MISSING_FIELDS' });
        continue;
      }

      // Fetch gate
      const gateResult = await pool.query(
        `SELECT id, status, mfa_mode, totp_secret_enc, geofence_id
         FROM sentinel.gates WHERE id = $1`,
        [gate_id]
      );
      if (gateResult.rowCount === 0) {
        results.push({ client_event_id: event.local_id, status: 'FAILED', error: 'GATE_NOT_FOUND' });
        continue;
      }
      const gate = gateResult.rows[0];

      if (gate.status === 'LOCKED') {
        results.push({ client_event_id: event.local_id, status: 'FAILED', error: 'GATE_LOCKED' });
        continue;
      }

      // Verify TOTP
      let gateSecret = await getGateSecretFromCache(gate_id);
      if (!gateSecret) gateSecret = gate.totp_secret_enc;

      const totpResult = verifyGateTOTP(gateSecret, totp_value, parseInt(totp_window));
      if (!totpResult.valid) {
        results.push({ client_event_id: event.local_id, status: 'REJECTED', error: 'TOTP_INVALID' });
        continue;
      }

      // Verify geofence
      const geoResult = await verifyGeofence(geofence_id, parseFloat(gps_lat), parseFloat(gps_lng));
      if (!geoResult.inFence && gate.mfa_mode === 'FULL') {
        results.push({ client_event_id: event.local_id, status: 'REJECTED', error: 'GPS_OUT_OF_FENCE' });
        continue;
      }

      // Verify liveness
      const livenessThreshold = gate.mfa_mode === 'FULL' ? 0.75 : 0.60;
      const livenessFloat = parseFloat(liveness_score);
      if (livenessFloat < livenessThreshold) {
        results.push({ client_event_id: event.local_id, status: 'REJECTED', error: 'LIVENESS_BELOW_THRESHOLD' });
        continue;
      }

      // Write auth event
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');

      const eventResult = await pool.query(
        `INSERT INTO sentinel.auth_events (
           user_id, device_id, student_roll, gate_id, geofence_id,
           client_ts, totp_window, payload_hash,
           totp_valid, gps_lat, gps_lng, gps_in_fence, gps_distance_m,
           liveness_score, liveness_pass, status, rejection_reason,
           hmac_valid, direction, mfa_mode_used
         ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7, $8, TRUE, $9, $10, $11, $12, $13, TRUE, 'GRANTED', NULL, TRUE, $14, $15)
         RETURNING id`,
        [
          device.userId, device.id, device.rollNumber, gate_id, geofence_id,
          client_ts || Date.now(), totp_window, payloadHash,
          gps_lat, gps_lng, geoResult.inFence, geoResult.distanceMeters,
          livenessFloat, direction || 'OUT', gate.mfa_mode,
        ]
      );

      const eventId = eventResult.rows[0].id;

      // Update presence
      await pool.query(
        `INSERT INTO sentinel.student_presence (user_id, current_status, last_gate_id, last_event_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           current_status = $2, last_gate_id = $3, last_event_id = $4, updated_at = NOW()`,
        [device.userId, direction || 'OUT', gate_id, eventId]
      );

      // Notify SSE
      global.sseNotify?.('auth_event', {
        id: eventId,
        student_roll: device.rollNumber,
        gate_id,
        status: 'GRANTED',
        liveness_score: livenessFloat,
        gps_in_fence: geoResult.inFence,
        totp_valid: true,
        direction: direction || 'OUT',
      });

      results.push({ client_event_id: event.local_id, status: 'SYNCED', server_event_id: eventId });
    } catch (e) {
      console.error('[Sync Batch] Error processing event:', e.message);
      results.push({ client_event_id: event.local_id, status: 'FAILED', error: e.message });
    }
  }

  return res.json({ synced: results.filter(r => r.status === 'SYNCED').length, results });
});

module.exports = router;
