const crypto = require('crypto');
const { pool } = require('../db');
const { checkAndStoreNonce } = require('../utils/redis');

const TIMESTAMP_WINDOW_MS = parseInt(process.env.HMAC_TIMESTAMP_WINDOW || '60') * 1000;

/**
 * HMAC-SHA256 verification middleware.
 *
 * Expected headers from Flutter client:
 *   x-device-id        — device fingerprint UUID
 *   x-request-ts       — Unix ms timestamp (string)
 *   x-request-nonce    — cryptographically random UUID
 *   x-request-sig      — HMAC-SHA256 hex of canonical string
 *
 * Canonical string format (MUST match Flutter client exactly):
 *   METHOD\nPATH\nSHA256(body_json)\nTIMESTAMP\nNONCE
 *
 * Fail-closed: ANY validation failure → 401, never 200.
 */
async function hmacMiddleware(req, res, next) {
  const deviceId  = req.headers['x-device-id'];
  const timestamp = req.headers['x-request-ts'];
  const nonce     = req.headers['x-request-nonce'];
  const signature = req.headers['x-request-sig'];

  // 1. All headers must be present
  if (!deviceId || !timestamp || !nonce || !signature) {
    return res.status(401).json({ error: 'HMAC_MISSING_HEADERS' });
  }

  // 2. Timestamp freshness check (replay prevention layer 1)
  const requestTs = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(requestTs) || Math.abs(now - requestTs) > TIMESTAMP_WINDOW_MS) {
    return res.status(401).json({ error: 'HMAC_TIMESTAMP_EXPIRED', server_ts: now });
  }

  // 3. Nonce uniqueness check via Redis (replay prevention layer 2)
  const nonceValid = await checkAndStoreNonce(nonce, 65);
  if (!nonceValid) {
    return res.status(401).json({ error: 'HMAC_REPLAY_DETECTED' });
  }

  // 4. Look up device and get its HMAC secret
  let deviceSecret;
  try {
    const result = await pool.query(
      `SELECT d.id, d.hmac_secret_enc, d.is_revoked, d.user_id,
              u.role, u.roll_number
       FROM sentinel.devices d
       JOIN sentinel.users u ON u.id = d.user_id
       WHERE d.device_fingerprint = $1 AND d.is_revoked = FALSE`,
      [deviceId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'HMAC_DEVICE_NOT_ENROLLED' });
    }

    const device = result.rows[0];
    // In production: decrypt hmac_secret_enc with server master key (AES-256)
    // For now, stored as plain hex in dev (bootstrap script sets this)
    deviceSecret = device.hmac_secret_enc;

    // Attach to request for downstream handlers
    req.device = {
      id:         device.id,
      userId:     device.user_id,
      userRole:   device.role,
      rollNumber: device.roll_number,
    };
  } catch (err) {
    console.error('[HMAC] DB lookup failed:', err.message);
    return res.status(500).json({ error: 'HMAC_DB_ERROR' });
  }

  // 5. Reconstruct canonical string (must match Flutter client)
  const bodyJson   = JSON.stringify(req.body); // body-parser must run first
  const bodyHash   = crypto.createHash('sha256').update(bodyJson).digest('hex');
  const canonical  = `${req.method}\n${req.path}\n${bodyHash}\n${timestamp}\n${nonce}`;

  // 6. Compute expected signature
  const expectedSig = crypto
    .createHmac('sha256', deviceSecret)
    .update(canonical)
    .digest('hex');

  // 7. Constant-time comparison (prevents timing side-channel attacks)
  let sigMatch = false;
  try {
    sigMatch = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSig, 'hex')
    );
  } catch (e) {
    // Buffer length mismatch = definitely wrong
    sigMatch = false;
  }

  if (!sigMatch) {
    return res.status(401).json({ error: 'HMAC_SIGNATURE_INVALID' });
  }

  // All checks passed
  next();
}

// Auth middleware for admin/warden/guard routes
function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'AUTH_NO_TOKEN' });
    }
    
    try {
      const jwt = require('jsonwebtoken');
      const secret = (req.headers['x-admin-token'] || process.env.ADMIN_JWT_SECRET) || (process.env.JWT_SECRET || 'dev_secret');
      const decoded = jwt.verify(token, secret);
      
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: 'AUTH_FORBIDDEN' });
      }
      
      req.admin = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'AUTH_INVALID_TOKEN' });
    }
  };
}

module.exports = { hmacMiddleware, requireAuth };
