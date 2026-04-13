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
app.use((req, res, next) => {
  let rawBody = '';
  req.on('data', chunk => { rawBody += chunk; });
  req.on('end', () => {
    req.rawBody = rawBody;
    next();
  });
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
}

// ── Health check ──────────────────────────────────────────────
app.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {}
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    ts: new Date().toISOString(),
    version: '2.0.0',
  });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/gate',  gateRoutes);
app.use('/auth',  authLimiter, authRoutes);
app.use('/admin', adminLimiter, adminRoutes);
app.use('/sync',  syncRoutes);
app.use('/leave', authLimiter, leaveRoutes);

// ── SSE: real-time stream for admin dashboard ─────────────────
// Admin dashboard connects once: GET /admin/stream
// Receives: auth_event, anomaly, leave_decision, gate_status
app.get('/admin/stream', require('./middleware/hmac').requireAuth(['admin','warden','guard']), sseHandler);

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', path: req.path });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  SentinelGate Backend v2.0               ║`);
  console.log(`║  Listening on http://localhost:${PORT}      ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
  console.log(`  ENV:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`  DB:   ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  console.log(`  Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}\n`);

  startAllCrons();
});

module.exports = app;
