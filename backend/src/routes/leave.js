/**
 * /leave routes — Phase 3 of the Flutter state machine
 */
const router = require('express').Router();
const { pool } = require('../db');
const { hmacMiddleware, requireAuth } = require('../middleware/hmac');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * POST /leave/request
 *
 * Student submits leave intent.
 * Called from Flutter BEFORE /auth/event if duration >= 5h.
 */
router.post('/request', hmacMiddleware, async (req, res) => {
  const { gate_id, reason, expected_return_ts, approval_doc_b64 } = req.body;
  const { device } = req;

  if (!gate_id || !reason || !expected_return_ts) {
    return res.status(400).json({ error: 'LEAVE_MISSING_FIELDS' });
  }

  const now = Date.now();
  const returnTs = parseInt(expected_return_ts, 10);
  const durationHours = (returnTs - now) / 3600000;

  if (durationHours < 0) {
    return res.status(400).json({ error: 'LEAVE_RETURN_IN_PAST' });
  }

  const LONG_LEAVE_THRESHOLD_HOURS = 5;
  const isLongLeave = durationHours >= LONG_LEAVE_THRESHOLD_HOURS;

  let docPath = null;

  if (approval_doc_b64 && isLongLeave) {
    try {
      const docBuffer = Buffer.from(approval_doc_b64, 'base64');
      const filename = `leave_${device.userId}_${now}.jpg`;
      docPath = path.join(UPLOAD_DIR, filename);
      fs.writeFileSync(docPath, docBuffer);
    } catch (e) {
      console.error('[Leave] Doc save failed:', e.message);
    }
  }

  const initialStatus = isLongLeave
    ? (approval_doc_b64 ? 'PENDING_APPROVAL' : 'PENDING_DOC')
    : 'APPROVED';

  try {
    const result = await pool.query(
      `INSERT INTO sentinel.leave_requests (
         user_id, device_id, gate_id,
         reason, duration_hours,
         expected_return_ts, approval_doc_path,
         status, is_long_leave
       ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7, $8, $9)
       RETURNING id`,
      [
        device.userId, device.id, gate_id,
        reason, parseFloat(durationHours.toFixed(2)),
        returnTs, docPath,
        initialStatus, isLongLeave,
      ]
    );

    const leaveId = result.rows[0].id;

    return res.json({
      leave_id:       leaveId,
      status:         initialStatus,
      duration_hours: parseFloat(durationHours.toFixed(1)),
      is_long_leave:  isLongLeave,
      can_proceed:    initialStatus === 'APPROVED',
      message:        initialStatus === 'APPROVED'
        ? 'Leave approved. Proceed to gate authentication.'
        : 'Leave requires warden approval. Your request has been submitted.',
    });
  } catch (err) {
    console.error('[Leave Request]', err.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /leave/status/:leaveId
 *
 * Flutter polls this every 30s while in PENDING_APPROVAL state.
 */
router.get('/status/:leaveId', hmacMiddleware, async (req, res) => {
  const { device } = req;
  try {
    const result = await pool.query(
      `SELECT id, status, reason, duration_hours, is_long_leave,
              approved_by_name, approved_at,
              expected_return_ts
       FROM sentinel.leave_requests
       WHERE id = $1 AND user_id = $2`,
      [req.params.leaveId, device.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'LEAVE_NOT_FOUND' });
    }
    const req_ = result.rows[0];
    return res.json({
      leave_id:       req_.id,
      status:         req_.status,
      can_proceed:    req_.status === 'APPROVED',
      approved_by:    req_.approved_by_name,
      approved_at:    req_.approved_at,
    });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /leave/upload-doc/:leaveId
 */
router.post('/upload-doc/:leaveId', hmacMiddleware, async (req, res) => {
  const { approval_doc_b64 } = req.body;
  const { device } = req;

  if (!approval_doc_b64) {
    return res.status(400).json({ error: 'DOC_MISSING' });
  }

  try {
    const leaveResult = await pool.query(
      `SELECT id, status FROM sentinel.leave_requests WHERE id = $1 AND user_id = $2`,
      [req.params.leaveId, device.userId]
    );
    if (leaveResult.rowCount === 0) return res.status(404).json({ error: 'LEAVE_NOT_FOUND' });
    if (leaveResult.rows[0].status === 'APPROVED') {
      return res.json({ message: 'Already approved.' });
    }

    const docBuffer = Buffer.from(approval_doc_b64, 'base64');
    const filename = `leave_${device.userId}_${Date.now()}.jpg`;
    const docPath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(docPath, docBuffer);

    await pool.query(
      `UPDATE sentinel.leave_requests
       SET approval_doc_path = $1, status = 'PENDING_APPROVAL'
       WHERE id = $2`,
      [docPath, req.params.leaveId]
    );

    return res.json({ received: true, status: 'PENDING_APPROVAL' });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /leave/pending (Warden/Admin)
 */
router.get('/pending', requireAuth(['admin', 'warden']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         lr.id, lr.reason, lr.duration_hours, lr.status,
         lr.is_long_leave, lr.approval_doc_path,
         lr.created_at, lr.expected_return_ts,
         u.roll_number, u.full_name, u.hostel_block, u.room_number,
         g.name as gate_name
       FROM sentinel.leave_requests lr
       JOIN sentinel.users u ON u.id = lr.user_id
       JOIN sentinel.gates g ON g.id = lr.gate_id
       WHERE lr.status IN ('PENDING_APPROVAL', 'PENDING_DOC')
       ORDER BY lr.created_at ASC`
    );
    return res.json({ pending: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /leave/approve/:leaveId  (Warden/Admin)
 */
router.post('/approve/:leaveId', requireAuth(['admin', 'warden']), async (req, res) => {
  const { action, notes } = req.body;
  const warden = req.admin;

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ error: 'INVALID_ACTION' });
  }

  try {
    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await pool.query(
      `UPDATE sentinel.leave_requests
       SET status = $1,
           approved_by = $2,
           approved_by_name = $3,
           approved_at = NOW(),
           warden_notes = $4
       WHERE id = $5`,
      [newStatus, warden.id, warden.name, notes || null, req.params.leaveId]
    );

    global.sseNotify?.('leave_decision', {
      leave_id: req.params.leaveId,
      status: newStatus,
      warden: warden.name,
    });

    return res.json({ success: true, new_status: newStatus });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /leave/history  (Admin/Warden)
 */
router.get('/history', requireAuth(['admin', 'warden']), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100'), 500);
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const result = await pool.query(
      `SELECT
         lr.id, lr.reason, lr.duration_hours, lr.status,
         lr.is_long_leave, lr.approved_by_name, lr.approved_at,
         lr.created_at, lr.expected_return_ts,
         u.roll_number, u.full_name, u.hostel_block,
         g.name as gate_name
       FROM sentinel.leave_requests lr
       JOIN sentinel.users u ON u.id = lr.user_id
       JOIN sentinel.gates g ON g.id = lr.gate_id
       WHERE DATE(lr.created_at AT TIME ZONE 'Asia/Kolkata') = $1
       ORDER BY lr.created_at DESC
       LIMIT $2`,
      [date, limit]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
