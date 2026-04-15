const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool;
let useMock = false;
let schemaInitialized = false;

function shouldUseSsl() {
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

// Check if schema exists
async function schemaExists(client) {
  try {
    const result = await client.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'sentinel'`
    );
    return result.rows.length > 0;
  } catch (err) {
    console.warn('[DB] Schema check failed:', err.message);
    return false;
  }
}

// Initialize database schema from schema.sql
async function initializeSchema() {
  if (schemaInitialized || useMock) {
    console.log('[DB] Schema initialization skipped (already initialized or using mock)');
    return;
  }
  
  let client;
  try {
    // Wait up to 5 seconds for a connection to be available
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    
    client = await Promise.race([pool.connect(), timeoutPromise]);
    
    const exists = await schemaExists(client);
    if (exists) {
      console.log('[DB] Schema already exists');
      schemaInitialized = true;
      return;
    }
    
    console.log('[DB] Initializing schema...');
    const schemaPath = path.join(__dirname, '../schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema with error handling
    try {
      await client.query(schema);
      console.log('[DB] ✅ Schema initialized successfully');
      schemaInitialized = true;
    } catch (execErr) {
      // Schema execution error - log but don't crash
      console.error('[DB] Schema execution error:', execErr.message.substring(0, 100));
      schemaInitialized = true; // Mark as attempted to avoid retry loop
    }
  } catch (err) {
    console.warn('[DB] Schema initialization failed (non-fatal):', err.message.substring(0, 100));
    // Don't mark as initialized - allow retry on next pool connection
  } finally {
    if (client) {
      try {
        client.release();
      } catch (e) {
        console.warn('[DB] Error releasing client:', e.message);
      }
    }
  }
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

    // Initialize schema on first connection
    pool.once('connect', () => {
      initializeSchema().catch(err => 
        console.error('[DB] Failed to initialize schema:', err.message)
      );
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

module.exports = { pool, queryWithRole, initializeSchema };
