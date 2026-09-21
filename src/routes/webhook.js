/**
 * routes/webhook.js
 * Receives ALL Telegram updates (channel posts + callback queries + messages)
 * and routes them to bot.js
 */

const express = require('express');
const router  = express.Router();
const { handleUpdate } = require('../bot');

router.post('/', express.json(), async (req, res) => {
  // Verify secret token
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    console.warn('[Webhook] Unauthorized');
    return res.status(401).json({ ok: false });
  }

  // Always respond 200 immediately so Telegram doesn't retry
  res.json({ ok: true });

  // Process update in background (don't await — keeps response fast)
  try {
    await handleUpdate(req.body);
  } catch (err) {
    console.error('[Webhook] handleUpdate error:', err);
  }
});

module.exports = router;
