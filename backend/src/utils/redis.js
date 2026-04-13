const Redis = require('ioredis');
let redis;
let useMock = false;

function getRedis() {
  if (!redis) {
    try {
      redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableReadyCheck: false,
      });
      redis.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
        if (!useMock) {
          console.log('[Redis] Falling back to mock cache');
          useMock = true;
          redis = require('../redis-mock.js');
        }
      });
      redis.on('connect', () => {
        console.log('[Redis] Connected');
      });
    } catch (err) {
      console.warn('[Redis] Not available, using mock:', err.message);
      useMock = true;
      redis = require('../redis-mock.js');
    }
  }
  return redis;
}

// Store nonce with TTL = HMAC window (60s)
// Returns false if nonce was already used (replay attempt)
async function checkAndStoreNonce(nonce, ttlSeconds = 65) {
  try {
    const r = getRedis();
    // NX = only set if not exists. Returns 1 if set, null if already existed.
    const result = await r.set(`nonce:${nonce}`, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK'; // true = fresh nonce, false = replay
  } catch (err) {
    // If Redis is down, we can't verify nonces — fail closed
    console.error('[Redis] Nonce check failed:', err.message);
    return false; // Reject request when Redis unavailable
  }
}

// Cache gate TOTP secret in Redis (warmed from DB on bootstrap)
async function cacheGateSecret(gateId, secret, ttlSeconds = 300) {
  try {
    const r = getRedis();
    await r.set(`gate_secret:${gateId}`, secret, 'EX', ttlSeconds);
  } catch (err) {
    console.error('[Redis] Cache write failed:', err.message);
  }
}

async function getGateSecretFromCache(gateId) {
  try {
    const r = getRedis();
    return await r.get(`gate_secret:${gateId}`);
  } catch (err) {
    return null;
  }
}

// Cache gate telemetry (rho, lambda, status) for QR display
async function cacheGateTelemetry(gateId, data, ttlSeconds = 35) {
  try {
    const r = getRedis();
    await r.set(`gate_telemetry:${gateId}`, JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {}
}

async function getGateTelemetry(gateId) {
  try {
    const r = getRedis();
    const raw = await r.get(`gate_telemetry:${gateId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

module.exports = { getRedis, checkAndStoreNonce, cacheGateSecret, getGateSecretFromCache, cacheGateTelemetry, getGateTelemetry };
