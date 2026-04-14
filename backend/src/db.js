const { Pool } = require('pg');
let pool;
let useMock = false;

function shouldUseSsl() {
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

// In development, use mock immediately
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
if (isDev || process.env.DISABLE_DB === 'true') {
  console.log('[DB] Development mode: using mock database');
  useMock = true;
  const mockDb = require('./db-mock');
  pool = mockDb.pool;
} else {
  // Try to use real PostgreSQL, fall back to mock if unavailable
  try {
    const useSsl = shouldUseSsl();
    const baseConfig = {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    };

    if (process.env.DATABASE_URL) {
      pool = new Pool({
        ...baseConfig,
        connectionString: process.env.DATABASE_URL,
      });
    } else {
      pool = new Pool({
        ...baseConfig,
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'sentinelgate',
        user:     process.env.DB_USER     || 'sentinel_app',
        password: process.env.DB_PASSWORD || '',
      });
    }

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err?.message || String(err).substring(0, 50));
      if (!useMock) {
        console.log('[DB] Falling back to mock database');
        useMock = true;
        const mockDb = require('./db-mock');
        pool = mockDb.pool;
      }
    });
  } catch (err) {
    console.warn('[DB] PostgreSQL unavailable, using mock:', err?.message || String(err).substring(0, 50));
    useMock = true;
    const mockDb = require('./db-mock');
    pool = mockDb.pool;
  }
}

// Set RLS context for each query — role-based row filtering
async function queryWithRole(userId, userRole, text, params) {
  if (useMock) {
    console.log(`[DB RLS] Mock mode - Role: ${userRole}, User: ${userId}`);
    return await pool.query(text, params);
  }
  
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL app.user_id = '${userId}'`);
    await client.query(`SET LOCAL app.user_role = '${userRole}'`);
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { pool, queryWithRole };
