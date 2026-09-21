/**
 * bot.js — Telegram Bot conversation engine
 *
 * Full auto-indexing flow:
 *
 *  CHANNEL: video uploaded
 *       ↓
 *  Bot forwards to ADMIN with buttons: [🎬 Movie] [📺 TV Show] [🎌 Anime]
 *       ↓  (admin taps one)
 *  Bot auto-searches TMDB using filename
 *       ↓
 *  Shows top results with poster: [1. Title (2023)] [2. ...] [3. ...]
 *       ↓  (admin taps one)
 *  If TV: asks [S01E01] [S01E02] ... or [Enter manually]
 *       ↓
 *  Confirms quality (auto-detected from filename)
 *       ↓
 *  Saves to DB ✅
 */

const tg   = require('./telegram');
const tmdb = require('./tmdb');
const db   = require('./database');
const { getLatestPending } = require('./database');

const ADMIN_ID = () => String(process.env.ADMIN_USER_ID || '');

// ── Entry point: called for every Telegram update ────────────────────────────
async function handleUpdate(update) {
  // Channel post with video → start flow
  if (update.channel_post) {
    await handleChannelPost(update.channel_post);
    return;
  }

  // Admin replying to bot (for manual episode entry)
  if (update.message && String(update.message.from?.id) === ADMIN_ID()) {
    await handleAdminMessage(update.message);
    return;
  }

  // Callback query (button taps)
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
}

// ── 1. Channel video detected ─────────────────────────────────────────────────
async function handleChannelPost(msg) {
  const video = msg.video || msg.document;
  if (!tg.isVideoFile(video)) return;

  const adminId = ADMIN_ID();
  if (!adminId) {
    console.warn('[Bot] ADMIN_USER_ID not set — skipping');
    return;
  }

  // Parse filename for hints
  const filename = video.file_name || 'video.mp4';
  const parsed   = tg.parseFilename(filename);

  // Create pending session
  const result = db.createPending({
    file_id:   video.file_id,
    file_name: filename,
    file_size: video.file_size || 0,
    duration:  video.duration  || 0,
    chat_id:   String(adminId),
    msg_id:    0,
  });
  const pendingId = result.lastInsertRowid;

  // Ask admin: Movie or TV?
  const text =
    `📥 <b>New video detected!</b>\n\n` +
    `📄 File: <code>${escHtml(filename)}</code>\n` +
    `💾 Size: ${formatBytes(video.file_size)}\n\n` +
    `<b>Ye kya hai?</b> Neeche tap karo 👇`;

  const sent = await tg.sendMessage(adminId, text, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🎬 Movie',    callback_data: `type:movie:${pendingId}` },
        { text: '📺 TV Show',  callback_data: `type:tv:${pendingId}` },
        { text: '🎌 Anime',   callback_data: `type:anime:${pendingId}` },
      ], [
        { text: '🗑️ Skip / Ignore', callback_data: `skip:${pendingId}` },
      ]],
    },
  });

  if (sent) db.updatePending(pendingId, { msg_id: sent.message_id });
}

// ── 2. Callback query handler ─────────────────────────────────────────────────
async function handleCallback(cq) {
  const userId = String(cq.from.id);
  if (userId !== ADMIN_ID()) {
    await tg.answerCallback(cq.id, 'Not authorized');
    return;
  }

  await tg.answerCallback(cq.id);

  const data = cq.data || '';
  const chatId = String(cq.message?.chat?.id);
  const msgId  = cq.message?.message_id;

  // ── skip ──────────────────────────────────────────────────────────────────
  if (data.startsWith('skip:')) {
    const pid = parseInt(data.split(':')[1]);
    db.deletePending(pid);
    await tg.editMessage(chatId, msgId, '🗑️ <b>Skipped.</b>');
    return;
  }

  // ── type selected: movie / tv / anime ─────────────────────────────────────
  if (data.startsWith('type:')) {
    const [, contentType, pidStr] = data.split(':');
    const pid     = parseInt(pidStr);
    const pending = db.getPending(pid);
    if (!pending) { await tg.editMessage(chatId, msgId, '❌ Session expired.'); return; }

    db.updatePending(pid, { content_type: contentType, state: 'searching' });

    await tg.editMessage(chatId, msgId, `🔍 <b>Searching TMDB...</b>`);

    const parsed = tg.parseFilename(pending.file_name);
    const query  = parsed.query || pending.file_name;

    // Store detected quality and episode info for later
    db.updatePending(pid, {
      search_query: query,
      quality:  parsed.quality,
      season:   parsed.season  || 0,
      episode:  parsed.episode || 0,
    });

    // Search TMDB
    let results;
    if (contentType === 'movie') {
      results = await tmdb.searchMovies(query, parsed.year);
    } else {
      results = await tmdb.searchTV(query);
      // mark anime type in results
      if (contentType === 'anime') results = results.map(r => ({ ...r, type: 'anime' }));
    }

    if (!results || results.length === 0) {
      // No results — ask manual input
      db.updatePending(pid, { state: 'manual_search' });
      await tg.editMessage(chatId, msgId,
        `😕 <b>Koi result nahi mila</b> for "<i>${escHtml(query)}</i>"\n\n` +
        `📝 Sahi naam type karke bhejo (reply karo is message ko):`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🗑️ Skip', callback_data: `skip:${pid}` }
            ]]
          }
        }
      );
      return;
    }

    await showSearchResults(chatId, msgId, pid, results, contentType, query);
    return;
  }

  // ── TMDB result selected ──────────────────────────────────────────────────
  if (data.startsWith('pick:')) {
    const [, pidStr, tmdbId, type] = data.split(':');
    const pid     = parseInt(pidStr);
    const pending = db.getPending(pid);
    if (!pending) { await tg.editMessage(chatId, msgId, '❌ Session expired.'); return; }

    if (type === 'movie') {
      // For movies: just confirm quality
      await showQualityConfirm(chatId, msgId, pid, tmdbId, type, pending);
    } else {
      // For TV/Anime: ask season & episode
      const season  = pending.season  || 1;
      const episode = pending.episode || 1;

      // If filename had S/E info, offer it as default
      if (pending.season > 0 && pending.episode > 0) {
        db.updatePending(pid, { state: 'confirm_episode' });
        await tg.editMessage(chatId, msgId,
          `📺 <b>Episode details:</b>\n\n` +
          `🔍 Filename se detect hua: <b>S${pad(season)}E${pad(episode)}</b>\n\n` +
          `Sahi hai?`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: `✅ S${pad(season)}E${pad(episode)} — Sahi hai`, callback_data: `ep:${pid}:${tmdbId}:${type}:${season}:${episode}` },
                { text: '✏️ Manually enter karo', callback_data: `ep_manual:${pid}:${tmdbId}:${type}` },
              ]]
            }
          }
        );
      } else {
        // Ask manually
        db.updatePending(pid, { state: 'awaiting_episode', search_query: `${tmdbId}|${type}` });
        await tg.editMessage(chatId, msgId,
          `📺 <b>Season aur Episode number bhejo</b>\n\n` +
          `Format: <code>1 3</code> (Season 1, Episode 3)\n` +
          `Ya: <code>S02E05</code>`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🗑️ Skip', callback_data: `skip:${pid}` }
              ]]
            }
          }
        );
      }
    }
    return;
  }

  // ── Episode confirmed from button ─────────────────────────────────────────
  if (data.startsWith('ep:')) {
    const [, pidStr, tmdbId, type, seasonStr, episodeStr] = data.split(':');
    const pid     = parseInt(pidStr);
    const season  = parseInt(seasonStr);
    const episode = parseInt(episodeStr);
    const pending = db.getPending(pid);
    if (!pending) { await tg.editMessage(chatId, msgId, '❌ Session expired.'); return; }

    db.updatePending(pid, { season, episode });
    await showQualityConfirm(chatId, msgId, pid, tmdbId, type, { ...pending, season, episode });
    return;
  }

  // ── Manual episode entry ───────────────────────────────────────────────────
  if (data.startsWith('ep_manual:')) {
    const [, pidStr, tmdbId, type] = data.split(':');
    const pid = parseInt(pidStr);
    db.updatePending(pid, { state: 'awaiting_episode', search_query: `${tmdbId}|${type}` });
    await tg.editMessage(chatId, msgId,
      `📝 <b>Season aur Episode number type karo</b>\n\n` +
      `Format: <code>1 3</code>  →  Season 1, Episode 3\n` +
      `Ya: <code>S02E05</code>`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🗑️ Skip', callback_data: `skip:${pid}` }]]
        }
      }
    );
    return;
  }

  // ── Quality confirmed ─────────────────────────────────────────────────────
  if (data.startsWith('quality:')) {
    const [, pidStr, tmdbId, type, quality] = data.split(':');
    const pid     = parseInt(pidStr);
    const pending = db.getPending(pid);
    if (!pending) { await tg.editMessage(chatId, msgId, '❌ Session expired.'); return; }

    db.updatePending(pid, { quality });
    await finalizeIndexing(chatId, msgId, pid, tmdbId, type, quality, pending);
    return;
  }

  // ── More results ──────────────────────────────────────────────────────────
  if (data.startsWith('more:')) {
    const [, pidStr, contentType, query] = data.split(':');
    const pid = parseInt(pidStr);
    await tg.editMessage(chatId, msgId, '🔍 <b>Searching more...</b>');
    let results = contentType === 'movie'
      ? await tmdb.searchMovies(query)
      : await tmdb.searchTV(query);
    if (contentType === 'anime') results = results.map(r => ({ ...r, type: 'anime' }));
    // show page 2 (already showing top 5, just re-show all)
    await showSearchResults(chatId, msgId, pid, results, contentType, query);
    return;
  }
}

// ── 3. Admin text reply ───────────────────────────────────────────────────────
async function handleAdminMessage(msg) {
  if (!msg.text) return;

  // Find latest pending session in awaiting_episode or manual_search state for this admin
  const pending = getLatestPending(ADMIN_ID(), ['awaiting_episode', 'manual_search']);

  if (!pending) return;

  const text    = msg.text.trim();
  const chatId  = String(msg.chat.id);

  // ── Manual search query ───────────────────────────────────────────────────
  if (pending.state === 'manual_search') {
    await tg.sendMessage(chatId, '🔍 <b>Searching...</b>');
    const type = pending.content_type || 'movie';
    let results = type === 'movie'
      ? await tmdb.searchMovies(text)
      : await tmdb.searchTV(text);
    if (type === 'anime') results = results.map(r => ({ ...r, type: 'anime' }));

    if (!results.length) {
      await tg.sendMessage(chatId, `😕 Koi result nahi mila for "<i>${escHtml(text)}</i>". Dobara try karo:`);
      return;
    }

    // Send as new message with results
    const sentMsg = await tg.sendMessage(chatId, '...'); // placeholder
    await showSearchResults(chatId, sentMsg.message_id, pending.id, results, type, text);
    return;
  }

  // ── Episode number entry ──────────────────────────────────────────────────
  if (pending.state === 'awaiting_episode') {
    // Parse "1 3" or "S01E03"
    let season, episode;
    const seMatch = text.match(/[Ss](\d+)[Ee](\d+)/);
    if (seMatch) {
      season  = parseInt(seMatch[1]);
      episode = parseInt(seMatch[2]);
    } else {
      const parts = text.split(/\s+/);
      season  = parseInt(parts[0]);
      episode = parseInt(parts[1]);
    }

    if (!season || !episode || isNaN(season) || isNaN(episode)) {
      await tg.sendMessage(chatId,
        '❌ Sahi format mein likhо:\n<code>1 3</code>  ya  <code>S01E03</code>');
      return;
    }

    const [tmdbId, type] = (pending.search_query || '').split('|');
    db.updatePending(pending.id, { season, episode });

    const sent = await tg.sendMessage(chatId, `✅ S${pad(season)}E${pad(episode)} set hua.`);
    await showQualityConfirm(chatId, sent.message_id, pending.id, tmdbId, type, { ...pending, season, episode });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function showSearchResults(chatId, msgId, pid, results, contentType, query) {
  const buttons = results.map((r, i) => ([{
    text: `${i + 1}. ${r.title}${r.year ? ' (' + r.year + ')' : ''}`,
    callback_data: `pick:${pid}:${r.tmdb_id}:${contentType}`,
  }]));

  buttons.push([{ text: '🔍 Naam se dhundho (manual)', callback_data: `more:${pid}:${contentType}:${query}` }]);
  buttons.push([{ text: '🗑️ Skip', callback_data: `skip:${pid}` }]);

  // Show first result's poster if available
  const first = results[0];
  const text =
    `🎯 <b>TMDB Results for:</b> <i>${escHtml(query)}</i>\n\n` +
    results.map((r, i) =>
      `${i + 1}. <b>${escHtml(r.title)}</b> ${r.year ? '(' + r.year + ')' : ''}\n` +
      `    <i>${escHtml(r.overview)}${r.overview?.length >= 120 ? '...' : ''}</i>`
    ).join('\n\n') +
    `\n\n👆 <b>Sahi wala tap karo:</b>`;

  await tg.editMessage(chatId, msgId, text, {
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showQualityConfirm(chatId, msgId, pid, tmdbId, type, pending) {
  db.updatePending(pid, { state: 'awaiting_quality', search_query: `${tmdbId}|${type}` });

  const detectedQ = pending.quality || '720p';
  const s = pending.season  || 0;
  const e = pending.episode || 0;

  const label = type === 'movie'
    ? `🎬 Movie  ·  TMDB ID: ${tmdbId}`
    : `📺 S${pad(s)}E${pad(e)}  ·  TMDB ID: ${tmdbId}`;

  await tg.editMessage(chatId, msgId,
    `${label}\n\n` +
    `📽️ <b>Quality select karo:</b>\n` +
    `(Filename se detect hua: <b>${detectedQ}</b>)`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: detectedQ === '4K'    ? '✅ 4K'    : '4K',    callback_data: `quality:${pid}:${tmdbId}:${type}:4K`    },
            { text: detectedQ === '1080p' ? '✅ 1080p' : '1080p', callback_data: `quality:${pid}:${tmdbId}:${type}:1080p` },
          ],[
            { text: detectedQ === '720p'  ? '✅ 720p'  : '720p',  callback_data: `quality:${pid}:${tmdbId}:${type}:720p`  },
            { text: detectedQ === '480p'  ? '✅ 480p'  : '480p',  callback_data: `quality:${pid}:${tmdbId}:${type}:480p`  },
          ],[
            { text: '🗑️ Skip', callback_data: `skip:${pid}` },
          ]
        ]
      }
    }
  );
}

async function finalizeIndexing(chatId, msgId, pid, tmdbId, type, quality, pending) {
  await tg.editMessage(chatId, msgId, '⏳ <b>Saving...</b>');

  // Fetch TMDB details for title and poster
  let title = null, posterPath = null;
  try {
    const axios = require('axios');
    const KEY   = process.env.TMDB_API_KEY;
    if (type === 'movie') {
      const { data } = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
        params: { api_key: KEY }, timeout: 6000
      });
      title      = data.title;
      posterPath = data.poster_path ? `https://image.tmdb.org/t/p/w300${data.poster_path}` : null;
    } else {
      const { data } = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
        params: { api_key: KEY }, timeout: 6000
      });
      title      = data.name;
      posterPath = data.poster_path ? `https://image.tmdb.org/t/p/w300${data.poster_path}` : null;
    }
  } catch (e) {
    console.error('[Bot] TMDB fetch error:', e.message);
  }

  const season  = pending.season  || 0;
  const episode = pending.episode || 0;

  try {
    db.upsertVideo({
      tmdb_id:     tmdbId,
      type,
      season,
      episode,
      quality,
      file_id:     pending.file_id,
      file_name:   pending.file_name,
      file_size:   pending.file_size,
      duration:    pending.duration,
      title:       title || pending.file_name,
      poster_path: posterPath,
    });

    db.deletePending(pid);

    const base      = process.env.BASE_URL || '';
    const embedUrl  = type === 'movie'
      ? `${base}/embed/${tmdbId}?type=movie`
      : `${base}/embed/${tmdbId}?type=${type}&s=${season}&e=${episode}`;

    const typeLabel = type === 'movie' ? '🎬 Movie' : type === 'anime' ? '🎌 Anime' : '📺 TV Show';
    const epLabel   = type === 'movie' ? '' : `\n📺 S${pad(season)}E${pad(episode)}`;

    await tg.editMessage(chatId, msgId,
      `✅ <b>Indexed successfully!</b>\n\n` +
      `${typeLabel}: <b>${escHtml(title || 'Unknown')}</b>${epLabel}\n` +
      `🎥 Quality: <b>${quality}</b>\n` +
      `🔗 Embed URL:\n<code>${embedUrl}</code>`
    );
  } catch (err) {
    console.error('[Bot] DB upsert error:', err.message);
    await tg.editMessage(chatId, msgId, `❌ <b>Error saving:</b> ${escHtml(err.message)}`);
  }
}

function pad(n) { return String(n).padStart(2, '0'); }
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function formatBytes(b = 0) {
  if (!b) return 'Unknown';
  const s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${s[i]}`;
}

module.exports = { handleUpdate };
