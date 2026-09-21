/**
 * routes/admin.js
 * Admin HTTP endpoints:
 *   GET /admin/register-webhook  — register with Telegram (call once after deploy)
 *   GET /admin/stats             — DB stats
 *   GET /admin/list              — recent indexed videos
 */

const express = require('express');
const router  = express.Router();
const { registerWebhook } = require('../telegram');
const { getStats, fetchList } = require('../database');
const { formatBytes } = require('../player');

// ── Register webhook ──────────────────────────────────────────────────────────
router.get('/register-webhook', async (req, res) => {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    return res.status(400).json({
      success: false,
      error: 'BASE_URL not set in Railway Variables',
    });
  }

  const webhookUrl = `${baseUrl}/webhook`;
  const secret     = process.env.WEBHOOK_SECRET;

  try {
    const result = await registerWebhook(webhookUrl, secret);
    res.json({ success: result.ok, webhook_url: webhookUrl, telegram: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const s = getStats();
    res.json({
      success: true,
      total:   s.total,
      movies:  s.movies,
      tv:      s.tv,
      anime:   s.anime,
      size:    formatBytes(s.total_bytes),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
