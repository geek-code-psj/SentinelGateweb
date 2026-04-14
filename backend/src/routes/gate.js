const router = require('express').Router();
const { pool } = require('../db');
const { requireAuth } = require('../middleware/hmac');
const { buildQRPayload, generateGateSecret } = require('../utils/totp');
const { cacheGateSecret, getGateSecretFromCache, cacheGateTelemetry, getGateTelemetry } = require('../utils/redis');

/**
 * POST /gate/bootstrap
 *
 * Called ONCE by the gate display tablet on boot (or network restore).
 * Returns:
 *  - totp_secret: the gate's base32 TOTP secret (so otplib can generate QR locally)
 *  - server_ts: current Unix seconds (for clock sync)
 *  - gate_status, mfa_mode: current operational state
 *
 * Authentication: None required (public endpoint for gate tablets)
 * In production with external access, use mTLS or add API key verification
 */
router.post('/bootstrap', async (req, res) => {
  console.log('[Gate Bootstrap] POST received - body:', JSON.stringify(req.body));
  const { gate_id } = req.body;

  if (!gate_id) {
    console.log('[Gate Bootstrap] Missing gate_id');
    return res.status(400).json({ error: 'gate_id required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, geofence_id, totp_secret_enc, status, mfa_mode,
              current_rho, current_lambda, mu_capacity
       FROM sentinel.gates WHERE id = $1`,
      [gate_id]
    );

    if (result.rowCount === 0) {
      console.log('[Gate Bootstrap] Gate not found:', gate_id);
      return res.status(404).json({ error: 'GATE_NOT_FOUND' });
    }

    const gate = result.rows[0];
    console.log('[Gate Bootstrap] ✓ Gate found:', gate_id);

    // Initialize gate secret if still placeholder
    let secret = gate.totp_secret_enc;
    if (secret === 'SEED_REPLACE_IN_BOOTSTRAP') {
      secret = generateGateSecret();
      await pool.query(
        `UPDATE sentinel.gates SET totp_secret_enc = $1, updated_at = NOW() WHERE id = $2`,
        [secret, gate_id]
      );
    }

    // Cache in Redis for fast telemetry reads
    await cacheGateSecret(gate_id, secret, 600);

    return res.json({
      gate_id:     gate.id,
      gate_name:   gate.name,
      geofence_id: gate.geofence_id,
      totp_secret: secret,           // sent once, tablet stores in memory only
      server_ts:   Math.floor(Date.now() / 1000),
      gate_status: gate.status,
      mfa_mode:    gate.mfa_mode,
      rho:         gate.current_rho,
      lambda:      gate.current_lambda,
      mu:          gate.mu_capacity,
    });
  } catch (err) {
    console.error('[Gate Bootstrap] Error:', {
      message: err?.message,
      stack: err?.stack?.split('\n')[0],
      type: typeof err,
      err: String(err)
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR', details: err?.message });
  }
});

/**
 * GET /gate/telemetry/:gateId
 *
 * Lightweight poll by the gate display every 30s.
 * Returns queue stats + recent auth events for this gate.
 * Does NOT return the TOTP secret (that was sent at bootstrap only).
 */
router.get('/telemetry/:gateId', async (req, res) => {
  const { gateId } = req.params;

  try {
    // Try Redis cache first
    const cached = await getGateTelemetry(gateId);

    // Always get fresh gate status
    const gateResult = await pool.query(
      `SELECT status, mfa_mode, current_rho, current_lambda, mu_capacity, updated_at
       FROM sentinel.gates WHERE id = $1`,
      [gateId]
    );
    if (gateResult.rowCount === 0) return res.status(404).json({ error: 'GATE_NOT_FOUND' });
    const gate = gateResult.rows[0];

    // Recent auths for this gate (last 20, last 2 minutes)
    const authResult = await pool.query(
      `SELECT a.student_roll as student_id,
              to_char(a.server_ts AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') as ts,
              a.status,
              CASE WHEN a.is_override THEN 'OVERRIDE'
                   WHEN a.mfa_mode_used IS NOT NULL THEN a.mfa_mode_used
                   ELSE 'TOTP+GPS+BIO' END as factor
       FROM sentinel.auth_events a
       WHERE a.gate_id = $1
         AND a.server_ts > NOW() - INTERVAL '5 minutes'
       ORDER BY a.server_ts DESC
       LIMIT 20`,
      [gateId]
    );

    const telemetry = {
      gate_status:  gate.status,
      mfa_mode:     gate.mfa_mode,
      rho:          parseFloat(gate.current_rho) || 0,
      lambda:       gate.current_lambda || 0,
      mu:           gate.mu_capacity || 12,
      updated_at:   gate.updated_at,
      recent_auths: authResult.rows,
      server_ts:    Math.floor(Date.now() / 1000),
    };

    await cacheGateTelemetry(gateId, telemetry, 30);
    return res.json(telemetry);
  } catch (err) {
    console.error('[Gate Telemetry] Error:', {
      message: err?.message,
      stack: err?.stack?.split('\n')[0],
      type: typeof err,
      err: String(err)
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR', details: err?.message });
  }
});

/**
 * POST /gate/mode  (Admin only)
 * Change a gate's MFA mode — called from admin dashboard
 */
router.post('/mode', requireAuth(['admin', 'warden']), async (req, res) => {
  const { gate_id, mode } = req.body;
  const validModes = ['FULL', 'SINGLE', 'TOTP_ONLY'];
  if (!gate_id || !validModes.includes(mode)) {
    return res.status(400).json({ error: 'INVALID_PARAMS' });
  }
  try {
    await pool.query(
      `UPDATE sentinel.gates SET mfa_mode = $1, updated_at = NOW() WHERE id = $2`,
      [mode, gate_id]
    );
    return res.json({ success: true, gate_id, new_mode: mode });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /gate/lockdown  (Admin only)
 * Lock all gates or a specific one
 */
router.post('/lockdown', requireAuth(['admin']), async (req, res) => {
  const { gate_id, action } = req.body; // action: LOCK | RELEASE
  const status = action === 'RELEASE' ? 'ACTIVE' : 'LOCKED';
  try {
    if (gate_id) {
      await pool.query(
        `UPDATE sentinel.gates SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, gate_id]
      );
    } else {
      // All gates
      await pool.query(
        `UPDATE sentinel.gates SET status = $1, updated_at = NOW()`,
        [status]
      );
    }
    return res.json({ success: true, action, gate_id: gate_id || 'ALL' });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
