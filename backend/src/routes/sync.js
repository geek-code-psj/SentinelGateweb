/**
 * /sync routes
 *
 * Phase 0 of the student app state machine:
 *   App hits /sync/time   → gets true server UTC + clock delta
 *   App hits /sync/delta  → downloads geofences, gate modes, revocations
 *   App hits /sync/spoof  → uploads locally-logged spoof attempt
 */
const router = require('express').Router();
const { pool } = require('../db');
const { hmacMiddleware } = require('../middleware/hmac');

/**
 * GET /sync/time
 *
 * SNTP-style clock sync.
 * Student app NEVER trusts phone clock (easily spoofed to cheat TOTP window).
 * Flutter client computes:
 *   true_time_ms = phone_time_ms + server_delta_ms
 */
router.get('/time', (req, res) => {
  const clientTs = parseInt(req.query.client_ts || '0', 10);
  const serverTs = Date.now();
  res.json({
    server_ts_ms: serverTs,
    client_ts_ms: clientTs,
    delta_ms: clientTs > 0 ? serverTs - clientTs : 0,
    totp_window: Math.floor(serverTs / 1000 / 30),
    totp_step_seconds: 30,
  });
});

/**
 * GET /sync/delta
 *
 * Student app pulls updates since last sync:
 *  - Geofence polygons (campus gate boundaries)
 *  - Gate modes (FULL / SINGLE — degraded if rho → 1)
 *  - Revoked device IDs (student's device may have been revoked by admin)
 *
 * Called by WorkManager on app open and every 15 minutes in background.
 */
router.get('/delta', async (req, res) => {
  const since = req.query.since
    ? new Date(parseInt(req.query.since, 10))
    : new Date(Date.now() - 24 * 3600 * 1000); // default: last 24h

  try {
    const [zonesRes, gatesRes] = await Promise.all([
      pool.query(
        `SELECT id, name, center_lat, center_lng, radius_meters,
                polygon_coords, is_active
         FROM sentinel.geofence_zones`
      ),
      pool.query(
        `SELECT id, name, status, mfa_mode, geofence_id
         FROM sentinel.gates
         WHERE updated_at > $1`,
        [since]
      ),
    ]);

    return res.json({
      geofences:   zonesRes.rows,
      gate_modes:  gatesRes.rows,
      server_ts:   Date.now(),
    });
  } catch (err) {
    console.error('[Sync Delta]', err.message);
    return res.status(500).json({ error: 'SYNC_FAILED' });
  }
});

/**
 * POST /sync/spoof
 *
 * Phase 2 Failure Logic: if GPS or liveness fails locally, app silently logs
 * and sends here via WorkManager background sync
 */
router.post('/spoof', hmacMiddleware, async (req, res) => {
  const {
    gate_id, geofence_id,
    fail_reason, gps_lat, gps_lng, gps_distance_m,
    liveness_score, client_ts,
  } = req.body;

  const { device } = req;

  try {
    // Write as REJECTED auth event + anomaly
    const eventResult = await pool.query(
      `INSERT INTO sentinel.auth_events (
         user_id, device_id, student_roll,
         gate_id, geofence_id,
         client_ts, status, rejection_reason,
         gps_lat, gps_lng, gps_distance_m,
         liveness_score, liveness_pass,
         totp_valid, gps_in_fence,
         hmac_valid
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         to_timestamp($6 / 1000.0), 'REJECTED', $7,
         $8, $9, $10,
         $11, FALSE,
         FALSE, FALSE,
         TRUE
       ) RETURNING id`,
      [
        device.userId, device.id, device.rollNumber,
        gate_id || 'UNKNOWN', geofence_id || 'UNKNOWN',
        client_ts || Date.now(), fail_reason || 'UNKNOWN',
        gps_lat, gps_lng, gps_distance_m,
        liveness_score,
      ]
    );

    // Flag as anomaly if repeated failures
    const recentFails = await pool.query(
      `SELECT COUNT(*) FROM sentinel.auth_events
       WHERE device_id = $1
         AND status = 'REJECTED'
         AND server_ts > NOW() - INTERVAL '10 minutes'`,
      [device.id]
    );

    const failCount = parseInt(recentFails.rows[0].count);
    if (failCount >= 3) {
      await pool.query(
        `INSERT INTO sentinel.anomaly_events
           (auth_event_id, user_id, model, anomaly_type, score, severity, details)
         VALUES ($1, $2, 'xgboost', 'REPEATED_SPOOF_ATTEMPTS', $3, $4, $5)`,
        [
          eventResult.rows[0].id,
          device.userId,
          Math.min(0.5 + failCount * 0.1, 0.99),
          failCount >= 5 ? 'high' : 'medium',
          JSON.stringify({ fail_count: failCount, reason: fail_reason, gate_id }),
        ]
      );
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[Sync Spoof]', err.message);
    return res.status(500).json({ error: 'SYNC_FAILED' });
  }
});

module.exports = router;
