/**
 * commands.js — Telegram bot commands (/start, /help, /id, /stats)
 *
 * bot.js sirf channel videos, button taps aur admin ke pending-session
 * replies handle karta hai. Isliye /start ka koi jawab nahi aata tha.
 * Ye module saare slash-commands ka reply bhejta hai.
 */

const tg = require('./telegram');
const db = require('./database');

const ADMIN_ID = () => String(process.env.ADMIN_USER_ID || '');

function formatBytes(b = 0) {
  if (!b) return '0 B';
  const s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${s[i]}`;
}

function isCommand(update) {
  const msg = update && (update.message || update.edited_message);
  return !!(msg && typeof msg.text === 'string' && msg.text.trim().startsWith('/'));
}

async function handleCommand(update) {
  const msg     = update.message || update.edited_message;
  const chatId  = String(msg.chat.id);
  const userId  = String(msg.from && msg.from.id || '');
  const cmd     = msg.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
  const isAdmin = !!ADMIN_ID() && userId === ADMIN_ID();

  try {
    if (cmd === '/start' || cmd === '/help') {
      await tg.sendMessage(chatId,
        `👋 <b>TeleStream Bot online hai!</b>\n\n` +
        (isAdmin
          ? `✅ Aap admin ho.\n\nChannel me koi video upload karo — main yahin puchhunga ki wo Movie hai, TV Show hai ya Anime, phir TMDB se match karke index kar dunga.\n\n` +
            `<b>Commands:</b>\n/start — ye message\n/stats — kitne videos indexed hain\n/id — aapki user ID`
          : `Ye ek private indexing bot hai, aap admin nahi ho.\n\n<b>Commands:</b>\n/id — aapki user ID`)
      );
      return;
    }

    if (cmd === '/id') {
      await tg.sendMessage(chatId,
        `🆔 User ID: <code>${userId}</code>\n💬 Chat ID: <code>${chatId}</code>` +
        (isAdmin ? `\n✅ Admin` : ``)
      );
      return;
    }

    if (cmd === '/stats') {
      if (!isAdmin) { await tg.sendMessage(chatId, '⛔ Ye command sirf admin ke liye hai.'); return; }
      const s = db.getStats() || {};
      await tg.sendMessage(chatId,
        `📊 <b>Stats</b>\n\n` +
        `Total: <b>${s.total || 0}</b>\n` +
        `🎬 Movies: <b>${s.movies || 0}</b>\n` +
        `📺 TV: <b>${s.tv || 0}</b>\n` +
        `🎌 Anime: <b>${s.anime || 0}</b>\n` +
        `💾 Size: <b>${formatBytes(s.total_bytes || 0)}</b>`
      );
      return;
    }

    await tg.sendMessage(chatId, '❓ Ye command samajh nahi aaya. /start try karo.');
  } catch (err) {
    console.error('[Commands] error:', err.message);
  }
}

module.exports = { isCommand, handleCommand };
