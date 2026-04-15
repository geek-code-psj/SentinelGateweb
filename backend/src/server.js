require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const gateRoutes  = require('./routes/gate');
const authRoutes  = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const syncRoutes  = require('./routes/sync');
const leaveRoutes = require('./routes/leave');
const { sseHandler } = require('./utils/sse');
const { startAllCrons } = require('./workers/crons');
const { pool }    = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// ── Security middleware ──────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,  // Allow gate display iframe
}));

app.use(cors({
  origin: [
    'http://localhost:3000',  // Admin dashboard dev
    'http://localhost:5173',  // Vite dev
    'http://localhost:8080',  // Gate display dev
    /\.sentinelgate\.local$/,  // Internal domain pattern
  ],
  credentials: true,
}));

// Rate limiting — auth endpoints are strict
const authLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 30,                 // 30 auth events per minute per IP (WorkManager batch)
  message: { error: 'RATE_LIMIT_EXCEEDED' },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'RATE_LIMIT_EXCEEDED' },
});

// ── Body parsing ─────────────────────────────────────────────
// IMPORTANT: raw body must be available before JSON parsing
// for HMAC canonical string construction
// Use express.json() with verify callback to capture raw body
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
}

// ── Request logger ────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  try {
    // Simple health check - don't block on DB queries
    // Returns immediately to avoid timeouts during pool operations
    res.json({
      status: 'ok',
      service: 'sentinelgate-backend',
      ts: new Date().toISOString(),
      version: '2.0.0',
    });
  } catch (err) {
    console.error('[HEALTH] Error:', err.message);
    res.status(500).json({ error: 'HEALTH_CHECK_FAILED', message: err.message });
  }
});

// Keep root path healthy for platforms that default health checks to '/'.
app.get('/', (req, res) => {
  try {
    res.status(200).json({ service: 'sentinelgate-backend', status: 'ok' });
  } catch (err) {
    console.error('[ROOT] Error:', err.message);
    res.status(500).json({ error: 'ROOT_FAILED' });
  }
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ── Routes ────────────────────────────────────────────────────
console.log('[SERVER] Registering gate routes...');
app.use('/api/gate',  gateRoutes);
console.log('[SERVER] Gate routes registered');
app.use('/api/auth',  authLimiter, authRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);
app.use('/api/sync',  syncRoutes);
app.use('/api/leave', authLimiter, leaveRoutes);

// ── SSE: real-time stream for admin dashboard ─────────────────
// Admin dashboard connects once: GET /api/admin/stream
// Receives: auth_event, anomaly, leave_decision, gate_status
app.get('/api/admin/stream', require('./middleware/hmac').requireAuth(['admin','warden','guard']), sseHandler);

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  console.log('[404]', req.method, req.path);
  res.status(404).json({ error: 'NOT_FOUND', path: req.path });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', req.method, req.path, '—', err.message);
  console.error('[STACK]', err.stack?.substring(0, 200));
  res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
});

// ── Start ─────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  SentinelGate Backend v2.0               ║`);
  console.log(`║  Listening on http://${HOST}:${PORT}         ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
  console.log(`  ENV:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`  DB:   ${process.env.DB_HOST || process.env.DATABASE_URL?.split('@')[1] || 'unknown'}`);
  console.log(`  Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}\n`);

  startAllCrons();
});

server.on('error', (err) => {
  console.error('[SERVER] Failed to start:', err.message);
  console.error('[SERVER] Stack:', err.stack?.substring(0, 300));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.message ? reason.message : String(reason);
  console.error('[PROCESS] Unhandled rejection:', msg);
  console.error('[PROCESS] Reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Uncaught exception:', err.message);
  console.error('[PROCESS] Stack:', err.stack?.substring(0, 300));
});

module.exports = app;
