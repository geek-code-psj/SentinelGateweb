// ─── BACKEND FIX: prev_event_hash chaining ────────────────────────────────────
// Drop this into your POST /auth/event handler in routes/auth.js (or wherever
// you currently do the INSERT into auth_events).
// Requires: crypto (built-in Node), your db client (pg pool or knex).
//
// BEFORE your current INSERT, add this block:

const crypto = require('crypto');

// 1. Get the last event for this student to form the chain
const lastEventResult = await db.query(
  `SELECT event_hash FROM auth_events
   WHERE user_id = $1
   ORDER BY true_timestamp DESC
   LIMIT 1`,
  [userId]                          // userId resolved from device_id after HMAC verify
);

const prevHash = lastEventResult.rows.length > 0
  ? lastEventResult.rows[0].event_hash
  : 'GENESIS';

// 2. Compute this block's event_hash (must match app's BlockService.blockPayloadHash)
//    Format: "blockIndex|prevHash|eventId|studentId|status|gateId|timestamp|faceConfidence"
//    blockIndex = total events for this student (count before insert)
const countResult = await db.query(
  `SELECT COUNT(*) FROM auth_events WHERE user_id = $1`,
  [userId]
);
const blockIndex = parseInt(countResult.rows[0].count, 10);

const hashInput = [
  blockIndex,
  prevHash,
  body.event_id,
  body.student_id,
  body.status,
  body.gate_id,
  body.true_timestamp,
  body.face_confidence
].join('|');

const eventHash = crypto.createHash('sha256').update(hashInput, 'utf8').digest('hex');

// 3. Add prev_hash and event_hash to your INSERT
// Your existing INSERT should now include these two extra columns:
//
// INSERT INTO auth_events (
//   ..your existing columns..,
//   prev_event_hash,
//   event_hash
// ) VALUES (
//   ..your existing values..,
//   $N,          -- prevHash
//   $N+1         -- eventHash
// )

// ─── SCHEMA MIGRATION (run once on Neon) ─────────────────────────────────────
// ALTER TABLE auth_events ADD COLUMN IF NOT EXISTS prev_event_hash TEXT DEFAULT 'GENESIS';
// ALTER TABLE auth_events ADD COLUMN IF NOT EXISTS event_hash TEXT;
// CREATE INDEX IF NOT EXISTS idx_auth_events_user_ts ON auth_events(user_id, true_timestamp DESC);

// ─── ADMIN FEED UUID FIX ─────────────────────────────────────────────────────
// In your GET /admin/feed and GET /admin/stream SSE queries, change:
//
//   SELECT * FROM auth_events ...
//
// to:
//
//   SELECT ae.*, u.roll_number, u.name, u.department
//   FROM auth_events ae
//   LEFT JOIN users u ON ae.user_id = u.id
//   ORDER BY ae.true_timestamp DESC
//
// Then in the SSE/feed response use u.roll_number instead of ae.user_id for display.
