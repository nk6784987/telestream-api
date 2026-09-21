/**
 * telegram.js
 * - Telegram Bot API calls (sendMessage, editMessage, answerCallbackQuery)
 * - File path resolver with cache
 * - Filename → search query cleaner
 */

const axios     = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3000, checkperiod: 300 });
const BOT   = () => `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// ── File path resolver ────────────────────────────────────────────────────────
async function resolveFilePath(fileId) {
  const key = `fp:${fileId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const { data } = await axios.get(`${BOT()}/getFile`, {
      params: { file_id: fileId }, timeout: 10000
    });
    if (!data.ok || !data.result?.file_path) return null;
    cache.set(key, data.result.file_path);
    return data.result.file_path;
  } catch (e) {
    console.error('[TG] getFile error:', e.message);
    return null;
  }
}

// ── Send / Edit messages ──────────────────────────────────────────────────────
async function sendMessage(chatId, text, extra = {}) {
  try {
    const { data } = await axios.post(`${BOT()}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...extra,
    });
    return data.result;
  } catch (e) {
    console.error('[TG] sendMessage error:', e.response?.data || e.message);
    return null;
  }
}

async function editMessage(chatId, msgId, text, extra = {}) {
  try {
    await axios.post(`${BOT()}/editMessageText`, {
      chat_id: chatId,
      message_id: msgId,
      text,
      parse_mode: 'HTML',
      ...extra,
    });
  } catch (e) {
    // Ignore "message not modified" errors
    if (!e.response?.data?.description?.includes('not modified')) {
      console.error('[TG] editMessage error:', e.response?.data || e.message);
    }
  }
}

async function deleteMessage(chatId, msgId) {
  try {
    await axios.post(`${BOT()}/deleteMessage`, { chat_id: chatId, message_id: msgId });
  } catch (e) { /* ignore */ }
}

async function answerCallback(callbackQueryId, text = '') {
  try {
    await axios.post(`${BOT()}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text,
    });
  } catch (e) { /* ignore */ }
}

async function sendPhoto(chatId, photoUrl, caption, extra = {}) {
  try {
    const { data } = await axios.post(`${BOT()}/sendPhoto`, {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
      ...extra,
    });
    return data.result;
  } catch (e) {
    // Fallback to text if photo fails
    return sendMessage(chatId, caption, extra);
  }
}

// ── Webhook register ──────────────────────────────────────────────────────────
async function registerWebhook(webhookUrl, secret) {
  const { data } = await axios.post(`${BOT()}/setWebhook`, {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['channel_post', 'message', 'callback_query'],
    drop_pending_updates: true,
  });
  return data;
}

// ── Filename cleaner → TMDB search query ─────────────────────────────────────
/**
 * "The.Dark.Knight.2008.1080p.BluRay.mp4" → { query: "The Dark Knight", year: "2008", quality: "1080p" }
 * "Game.of.Thrones.S01E03.720p.mkv"       → { query: "Game of Thrones", season: 1, episode: 3, quality: "720p", isSeries: true }
 */
function parseFilename(filename) {
  if (!filename) return { query: '', quality: '720p' };

  // Remove extension
  let name = filename.replace(/\.(mp4|mkv|webm|avi|mov|m4v)$/i, '');

  // Detect quality
  const qualityMatch = name.match(/\b(4K|2160p|1080p|720p|480p|360p|CAM|HDCAM|WEBRip|BluRay|HDRip)\b/i);
  const quality = qualityMatch ? normalizeQuality(qualityMatch[1]) : '720p';

  // Detect S01E01 pattern → TV series
  const epMatch = name.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
  if (epMatch) {
    const season  = parseInt(epMatch[1], 10);
    const episode = parseInt(epMatch[2], 10);
    // Everything before SxxExx is the title
    const titlePart = name.slice(0, epMatch.index);
    const query = cleanTitleString(titlePart);
    return { query, season, episode, quality, isSeries: true };
  }

  // Detect year → likely movie
  const yearMatch = name.match(/\b(19\d{2}|20\d{2})\b/);
  const year  = yearMatch ? yearMatch[1] : null;
  const query = year
    ? cleanTitleString(name.slice(0, yearMatch.index))
    : cleanTitleString(name);

  return { query, year, quality, isSeries: false };
}

function cleanTitleString(str) {
  return str
    .replace(/[._\-]+/g, ' ')   // dots/underscores → spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuality(q) {
  const map = { '4k': '4K', '2160p': '4K', '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '480p' };
  return map[q.toLowerCase()] || q.toUpperCase();
}

function isVideoFile(video) {
  if (!video) return false;
  const mime = video.mime_type || '';
  const name = video.file_name || '';
  return mime.startsWith('video/') || /\.(mp4|mkv|webm|avi|mov|m4v)$/i.test(name);
}

module.exports = {
  resolveFilePath, sendMessage, editMessage, deleteMessage,
  answerCallback, sendPhoto, registerWebhook,
  parseFilename, isVideoFile,
};
