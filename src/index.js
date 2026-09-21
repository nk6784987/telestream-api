require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const db      = require('./database');

const webhookRouter = require('./routes/webhook');
const embedRouter   = require('./routes/embed');
const streamRouter  = require('./routes/stream');
const apiRouter     = require('./routes/api');
const adminRouter   = require('./routes/admin');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(morgan('[:date[clf]] :method :url :status :response-time ms'));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhook', webhookRouter);
app.use('/embed',   embedRouter);
app.use('/stream',  streamRouter);
app.use('/api/v1',  apiRouter);
app.use('/admin',   adminRouter);

// ── Home ──────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service:  'TeleStream API v2',
    status:   'running',
    endpoints: {
      embed:  '/embed/:tmdb_id?type=movie|tv|anime&s=&e=&q=',
      stream: '/stream/:file_id',
      api: {
        movie: '/api/v1/movie/:tmdb_id',
        tv:    '/api/v1/tv/:tmdb_id/season/:s/episode/:e',
        list:  '/api/v1/list/:tmdb_id',
        stats: '/api/v1/stats',
      },
      admin: {
        register_webhook: '/admin/register-webhook',
        stats:            '/admin/stats',
      },
    },
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server]', err);
  res.status(500).json({ error: err.message });
});

// ── Hourly cleanup of stale pending sessions ──────────────────────────────────
setInterval(() => db.cleanPending(), 60 * 60 * 1000);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 TeleStream API v2 — port ${PORT}`);

  const missing = ['BOT_TOKEN','TMDB_API_KEY','ADMIN_USER_ID','BASE_URL','WEBHOOK_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.warn('⚠️  Missing env vars:', missing.join(', '));
  } else {
    console.log('✅ All env vars set');
  }
});
