/**
 * routes/webhook.js
 * Receives ALL Telegram updates (channel posts + callback queries + messages)
 * and routes them to commands.js (slash commands) or bot.js (indexing flow).
 */

const express = require('express');
const router  = express.Router();
const { handleUpdate } = require('../bot');
const { isCommand, handleCommand } = require('../commands');

router.post('/', express.json(), async (req, res) => {
  // Verify secret token
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    console.warn('[Webhook] Unauthorized — secret token mismatch');
    return res.status(401).json({ ok: false });
  }

  // Always respond 200 immediately so Telegram doesn't retry
  res.json({ ok: true });

  const update = req.body || {};

  try {
    if (isCommand(update)) {
      await handleCommand(update);
    } else {
      await handleUpdate(update);
    }
  } catch (err) {
    console.error('[Webhook] update error:', err);
  }
});

module.exports = router;
