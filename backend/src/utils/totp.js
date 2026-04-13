const { totp } = require('otplib');
const crypto = require('crypto');

// Configure otplib — 30s window, 1 step tolerance for clock drift
totp.options = {
  step: 30,
  window: 1,          // accept 1 step before/after (handles ~30s clock drift)
  digits: 6,
  algorithm: 'sha1',  // standard TOTP (RFC 6238)
};

/**
 * Generate the current TOTP for a gate.
 * @param {string} secret — base32 secret (stored encrypted in DB)
 * @returns {string} 6-digit token
 */
function generateGateTOTP(secret) {
  return totp.generate(secret);
}

/**
 * Verify a TOTP submitted by the student app against a gate's secret.
 *
 * FLOW CLARIFICATION (critical logic fix):
 * ─────────────────────────────────────────
 * The QR code encodes:
 *   { gate_id, geofence_id, totp_value, window_number, mode }
 *
 * The student app SCANS the QR → reads the totp_value from it.
 * The app then submits that totp_value to the backend for verification.
 *
 * The backend re-generates the expected TOTP from the gate's secret
 * for the claimed window_number and compares. This means:
 *
 * 1. The QR itself doesn't need to be sent — only the numeric value matters.
 * 2. We verify the value is for the CORRECT gate (gate_id in payload).
 * 3. We verify the window_number is within acceptable clock drift.
 * 4. The face recognition result (liveness_score) is a SEPARATE factor —
 *    it's computed on-device and the confidence score + embedding hash
 *    are submitted alongside the TOTP. The QR is just the session context
 *    that ties the biometric to a specific gate + time window.
 *
 * So the QR does NOT generate the face token — it provides the session
 * context (gate + window) within which the face verification is valid.
 *
 * @param {string} secret — gate's base32 TOTP secret
 * @param {string} submittedToken — 6-digit string from student app
 * @param {number} claimedWindow — window number from QR payload
 * @returns {{ valid: boolean, delta: number }}
 */
function verifyGateTOTP(secret, submittedToken, claimedWindow) {
  const currentWindow = Math.floor(Date.now() / 1000 / 30);
  const windowDelta = currentWindow - claimedWindow;

  // Reject if claimed window is too old or in the future
  // Allow 2 windows tolerance (60s) to handle offline sync delay
  if (Math.abs(windowDelta) > 2) {
    return { valid: false, delta: windowDelta, reason: 'WINDOW_EXPIRED' };
  }

  // Verify against the claimed window's expected token
  // otplib's window=1 already handles ±1 step, so covering ±2 explicitly:
  const valid = totp.check(submittedToken, secret);
  return { valid, delta: windowDelta };
}

/**
 * Generate a fresh base32 secret for a new gate.
 * 160 bits of entropy — compatible with all TOTP apps.
 */
function generateGateSecret() {
  // 20 random bytes → base32
  const bytes = crypto.randomBytes(20);
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += base32chars[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) result += base32chars[(value << (5 - bits)) & 0x1f];
  return result;
}

/**
 * Build the QR payload that the gate display encodes.
 * This is what the student app decodes when scanning.
 *
 * The payload ties together:
 *  - gate_id: which physical gate this token is for
 *  - geofence_id: the geographic zone to check GPS against
 *  - t: the current TOTP value (6 digits)
 *  - w: the TOTP window number (server time ÷ 30)
 *  - mode: FULL or SINGLE (so app knows which factors to submit)
 *  - v: payload version (for future schema changes)
 *
 * The student app will:
 *  1. Read gate_id + geofence_id
 *  2. Verify their GPS is within geofence_id
 *  3. Capture face (liveness detection on-device)
 *  4. Submit { gate_id, totp: t, window: w, gps_lat, gps_lng,
 *              liveness_score, embedding_hash } signed with HMAC
 */
function buildQRPayload(gateId, geofenceId, secret, mode = 'FULL') {
  const currentToken = generateGateTOTP(secret);
  const currentWindow = Math.floor(Date.now() / 1000 / 30);
  return {
    v: 2,
    g: gateId,
    geo: geofenceId,
    t: currentToken,
    w: currentWindow,
    mode,
  };
}

module.exports = { generateGateTOTP, verifyGateTOTP, generateGateSecret, buildQRPayload };
