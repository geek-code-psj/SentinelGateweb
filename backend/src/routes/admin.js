const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/hmac');

/**
 * POST /admin/login
 * Returns JWT for admin/warden/guard dashboard access
 */
router.post('/login', async (req, res) => {
  const { roll_number, password } = req.body;
  console.log('[Admin Login] Attempt:', { roll_number, password_length: password?.length || 0 });
  
  if (!roll_number || !password) {
    console.log('[Admin Login] Missing fields:', { roll_number: !!roll_number, password: !!password });
    return res.status(400).json({ error: 'LOGIN_MISSING_FIELDS' });
  }
  try {
    const result = await pool.query(
      `SELECT id, roll_number, role, full_name, password_hash FROM sentinel.users
       WHERE roll_number = $1 AND role IN ('admin','warden','guard') AND is_active = TRUE`,
      [roll_number]
    );
    console.log('[Admin Login] User lookup result:', { rowCount: result.rowCount, found: result.rowCount > 0 });
    
    if (result.rowCount === 0) {
      console.log('[Admin Login] User not found or not admin/warden/guard');
      return res.status(401).json({ error: 'LOGIN_INVALID_CREDENTIALS' });
    }
    
    const user = result.rows[0];
    console.log('[Admin Login] User found:', { roll: user.roll_number, role: user.role, has_hash: !!user.password_hash });
    
    // Validate password using bcrypt
    if (!user.password_hash) {
      console.log('[Admin Login] No password hash set for user:', user.roll_number);
      return res.status(401).json({ error: 'LOGIN_INVALID_CREDENTIALS' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('[Admin Login] Password validation:', { match: passwordMatch });
    
    if (!passwordMatch) {
      console.log('[Admin Login] Password mismatch for:', roll_number);
      return res.status(401).json({ error: 'LOGIN_INVALID_CREDENTIALS' });
    }
    
    const secret = user.role === 'admin'
      ? (process.env.ADMIN_JWT_SECRET || 'dev_admin_secret')
      : (process.env.JWT_SECRET || 'dev_secret');
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name, roll: user.roll_number },
      secret,
      { expiresIn: '12h' }
    );
    console.log('[Admin Login] ✓ SUCCESS:', { roll: user.roll_number, role: user.role });
    return res.json({ token, role: user.role, name: user.full_name });
  } catch (err) {
    console.log('[Admin Login] ✗ ERROR:', { message: err.message, stack: err.stack });
    return res.status(500).json({ error: 'INTERNAL_ERROR', details: err.message });
  }
});

/**
 * GET /admin/feed
 * Live authentication feed for admin dashboard
 */
router.get('/feed', requireAuth(['admin', 'warden', 'guard']), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '60'), 200);
  const since = req.query.since;

  try {
    const result = await pool.query(
      `SELECT
         a.id,
         a.student_roll,
         a.gate_id,
         a.geofence_id,
         to_char(a.server_ts AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') as ts,
         a.server_ts,
         a.totp_valid,
         a.gps_in_fence,
         a.gps_distance_m,
         a.liveness_score,
         a.liveness_pass,
         a.status,
         a.rejection_reason,
         a.xgboost_score,
         a.stgnn_score,
         a.anomaly_type,
         a.is_override,
         a.direction,
         a.replay_attempt
       FROM sentinel.auth_events a
       WHERE ($1::timestamptz IS NULL OR a.server_ts > $1::timestamptz)
       ORDER BY a.server_ts DESC
       LIMIT $2`,
      [since || null, limit]
    );
    return res.json({ events: result.rows, count: result.rowCount });
  } catch (err) {
    console.error('[Admin Feed]', err.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /admin/metrics
 * Dashboard summary metrics
 */
router.get('/metrics', requireAuth(['admin', 'warden', 'guard']), async (req, res) => {
  try {
    const [authCount, anomalyCount, gatesResult, curfewResult, presenceResult] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM sentinel.auth_events
           WHERE server_ts > NOW() - INTERVAL '1 hour'`
        ),
        pool.query(
          `SELECT COUNT(*) FROM sentinel.anomaly_events
           WHERE created_at > NOW() - INTERVAL '24 hours'`
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
                  COUNT(*) as total,
                  MAX(current_rho) as peak_rho
           FROM sentinel.gates`
        ),
        pool.query(
          `SELECT COUNT(*) FROM sentinel.curfew_violations
           WHERE violation_date = CURRENT_DATE AND status = 'UNRESOLVED'`
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE current_status = 'OUT') as out_count
           FROM sentinel.student_presence`
        ),
      ]);

    return res.json({
      auths_per_hour:   parseInt(authCount.rows[0].count),
      anomalies_today:  parseInt(anomalyCount.rows[0].count),
      active_gates:     `${gatesResult.rows[0].active} / ${gatesResult.rows[0].total}`,
      peak_rho:         parseFloat(gatesResult.rows[0].peak_rho || 0).toFixed(2),
      curfew_violations: parseInt(curfewResult.rows[0].count),
      students_out:      parseInt(presenceResult.rows[0].out_count),
      server_ts:         Date.now(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /admin/anomalies
 */
router.get('/anomalies', requireAuth(['admin', 'warden']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ae.id, ae.anomaly_type, ae.score, ae.severity, ae.model,
         ae.created_at,
         a.student_roll, a.gate_id,
         to_char(ae.created_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') as ts
       FROM sentinel.anomaly_events ae
       LEFT JOIN sentinel.auth_events a ON a.id = ae.auth_event_id
       ORDER BY ae.created_at DESC
       LIMIT 50`
    );
    return res.json({ anomalies: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /admin/override
 * Guard force-entry/exit override
 */
router.post('/override', requireAuth(['admin', 'warden', 'guard']), async (req, res) => {
  const { student_roll, gate_id, action, reason, notes } = req.body;
  const guardId = req.admin.id;

  if (!student_roll || !gate_id || !action || !reason) {
    return res.status(400).json({ error: 'OVERRIDE_MISSING_FIELDS' });
  }

  try {
    const userResult = await pool.query(
      `SELECT id FROM sentinel.users WHERE roll_number = $1`,
      [student_roll]
    );
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'OVERRIDE_USER_NOT_FOUND' });
    }
    const userId = userResult.rows[0].id;

    const eventResult = await pool.query(
      `INSERT INTO sentinel.auth_events (
         user_id, student_roll, gate_id,
         client_ts, status, is_override, direction
       ) VALUES ($1, $2, $3, NOW(), 'OVERRIDE', TRUE, $4)
       RETURNING id`,
      [userId, student_roll, gate_id,
       action === 'FORCE_EXIT' ? 'OUT' : 'IN']
    );

    const eventId = eventResult.rows[0].id;

    await pool.query(
      `INSERT INTO sentinel.override_events
         (auth_event_id, guard_user_id, student_roll, gate_id, action, reason, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, guardId, student_roll, gate_id, action, reason, notes || null]
    );

    if (action !== 'FORCE_EXEMPT') {
      const dir = action === 'FORCE_EXIT' ? 'OUT' : 'IN';
      await pool.query(
        `INSERT INTO sentinel.student_presence (user_id, current_status, last_gate_id, last_event_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           current_status = $2, last_gate_id = $3, last_event_id = $4, updated_at = NOW()`,
        [userId, dir, gate_id, eventId]
      );
    }

    if (action === 'FORCE_EXEMPT') {
      await pool.query(
        `UPDATE sentinel.curfew_violations
         SET status = 'EXEMPTED', resolved_at = NOW()
         WHERE user_id = $1 AND violation_date = CURRENT_DATE`,
        [userId]
      );
    }

    return res.json({
      success: true,
      event_id: eventId,
      tx_id: `OVR-${eventId.slice(0,8).toUpperCase()}`,
    });
  } catch (err) {
    console.error('[Override]', err.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /admin/overrides
 */
router.get('/overrides', requireAuth(['admin', 'warden', 'guard']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         o.id, o.student_roll, o.gate_id, o.action, o.reason, o.notes,
         to_char(o.created_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') as ts,
         'OVR-' || UPPER(LEFT(o.id::text, 8)) as tx_id,
         u.roll_number as guard_roll
       FROM sentinel.override_events o
       JOIN sentinel.users u ON u.id = o.guard_user_id
       WHERE o.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY o.created_at DESC`
    );
    return res.json({ overrides: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /admin/curfew
 */
router.get('/curfew', requireAuth(['admin', 'warden']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         v.id, v.student_roll, v.student_name, v.minutes_late,
         v.last_seen_gate, v.status,
         to_char(v.last_seen_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') as last_seen_ts
       FROM sentinel.curfew_violations v
       WHERE v.violation_date = CURRENT_DATE
       ORDER BY v.minutes_late DESC NULLS LAST`
    );
    return res.json({ violations: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /admin/geofences
 */
router.get('/geofences', requireAuth(['admin', 'warden', 'guard']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, center_lat, center_lng, radius_meters,
              polygon_coords, is_active
       FROM sentinel.geofence_zones ORDER BY id`
    );
    return res.json({ zones: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * PUT /admin/geofences/:id
 */
router.put('/geofences/:id', requireAuth(['admin']), async (req, res) => {
  const { polygon_coords, center_lat, center_lng, radius_meters, name } = req.body;
  try {
    await pool.query(
      `UPDATE sentinel.geofence_zones
       SET polygon_coords = $1, center_lat = $2, center_lng = $3,
           radius_meters = $4, name = COALESCE($5, name)
       WHERE id = $6`,
      [JSON.stringify(polygon_coords), center_lat, center_lng, radius_meters, name, req.params.id]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /admin/gates
 */
router.get('/gates', requireAuth(['admin', 'warden', 'guard']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, geofence_id, location_label, status, mfa_mode,
              current_rho, current_lambda, mu_capacity, updated_at
       FROM sentinel.gates ORDER BY id`
    );
    return res.json({ gates: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /admin/presence
 */
router.get('/presence', requireAuth(['admin', 'warden']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         p.current_status, p.updated_at,
         u.roll_number, u.hostel_block, u.room_number,
         g.name as last_gate_name
       FROM sentinel.student_presence p
       JOIN sentinel.users u ON u.id = p.user_id
       LEFT JOIN sentinel.gates g ON g.id = p.last_gate_id
       WHERE p.current_status = 'OUT'
       ORDER BY p.updated_at DESC`
    );
    return res.json({ students_out: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
