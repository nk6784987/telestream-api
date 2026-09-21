/**
 * Plyr.js HTML Player page generator
 */

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes = 0) {
  if (!bytes) return 'Unknown size';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(secs = 0) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}h ${m}m`
    : `${m}m ${String(s).padStart(2, '0')}s`;
}

function buildLabel(row) {
  if (row.type === 'movie') {
    return row.title || `Movie · TMDB ${row.tmdb_id}`;
  }
  const s = String(row.season).padStart(2, '0');
  const e = String(row.episode).padStart(2, '0');
  return row.title
    ? `${row.title} · S${s}E${e}`
    : `TMDB ${row.tmdb_id} · S${s}E${e}`;
}

/**
 * allQualities = [{quality, stream_url, embed_url}] — for quality switcher
 */
function buildPlayerPage(row, streamUrl, allQualities = []) {
  const label    = buildLabel(row);
  const size     = formatBytes(row.file_size);
  const duration = formatDuration(row.duration);
  const storeKey = `ts_${row.file_id}`.replace(/[^a-zA-Z0-9_]/g, '_');

  // Quality switcher buttons HTML
  const qualityButtons = allQualities.length > 1
    ? allQualities.map(q => `
        <a href="${escHtml(q.embed_url)}"
           class="q-btn${q.quality === row.quality ? ' active' : ''}">
          ${escHtml(q.quality)}
        </a>`).join('')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="referrer" content="no-referrer"/>
  <title>${escHtml(label)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.7.8/plyr.min.css"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%; height: 100%;
      background: #0d0d0d;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #ccc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
    }

    .container {
      width: 100%;
      max-width: 1280px;
    }

    /* ── Plyr theme ── */
    .plyr {
      --plyr-color-main: #e50914;
      --plyr-video-background: #000;
      --plyr-range-fill-background: #e50914;
      border-radius: 0;
    }

    video {
      width: 100%;
      aspect-ratio: 16/9;
      display: block;
      background: #000;
    }

    /* ── Meta bar ── */
    .meta-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 14px;
      background: #161616;
      border-top: 1px solid #222;
    }

    .meta-title {
      font-size: 13px;
      font-weight: 600;
      color: #eee;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .meta-info {
      font-size: 11px;
      color: #666;
      white-space: nowrap;
    }

    /* ── Quality switcher ── */
    .quality-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: #111;
      border-top: 1px solid #1e1e1e;
      flex-wrap: wrap;
    }

    .quality-label {
      font-size: 11px;
      color: #555;
      margin-right: 4px;
    }

    .q-btn {
      display: inline-block;
      padding: 3px 10px;
      font-size: 11px;
      border-radius: 3px;
      border: 1px solid #333;
      color: #aaa;
      text-decoration: none;
      transition: all .15s;
    }

    .q-btn:hover { border-color: #e50914; color: #fff; }
    .q-btn.active { background: #e50914; border-color: #e50914; color: #fff; font-weight: 700; }

    /* Mobile full-bleed */
    @media (max-width: 600px) {
      .meta-bar, .quality-row { padding: 8px 10px; }
    }
  </style>
</head>
<body>
<div class="container">

  <video id="player" playsinline controls crossorigin="anonymous">
    <source src="${escHtml(streamUrl)}" type="video/mp4"/>
    Your browser does not support HTML5 video.
  </video>

  <div class="meta-bar">
    <span class="meta-title">${escHtml(label)}</span>
    <span class="meta-info">${escHtml(row.quality)}${size ? ' · ' + size : ''}${duration ? ' · ' + duration : ''}</span>
  </div>

  ${qualityButtons ? `
  <div class="quality-row">
    <span class="quality-label">Quality:</span>
    ${qualityButtons}
  </div>` : ''}

</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.7.8/plyr.min.js"></script>
<script>
  const player = new Plyr('#player', {
    controls: [
      'play-large','play','rewind','fast-forward',
      'progress','current-time','duration',
      'mute','volume','settings','pip','fullscreen'
    ],
    settings: ['speed'],
    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
    keyboard: { focused: true, global: true },
    tooltips: { controls: true, seek: true },
  });

  // ── Resume from last watched position ──
  const KEY = '${storeKey}';
  player.on('ready', () => {
    try {
      const saved = parseFloat(localStorage.getItem(KEY) || '0');
      if (saved > 5) player.currentTime = saved;
    } catch(e) {}
  });
  player.on('timeupdate', () => {
    try {
      if (player.currentTime > 5)
        localStorage.setItem(KEY, player.currentTime);
    } catch(e) {}
  });
</script>
</body>
</html>`;
}

function buildNotFoundPage(tmdbId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Not Found</title>
  <style>
    body { background:#0d0d0d; color:#555; display:flex; align-items:center;
           justify-content:center; height:100vh; font-family:sans-serif;
           flex-direction:column; gap:10px; }
    h2 { color:#e50914; font-size:1.1rem; font-weight:600; }
    p  { font-size:0.8rem; }
  </style>
</head>
<body>
  <h2>Video Not Found</h2>
  <p>TMDB ID <strong>${escHtml(tmdbId)}</strong> abhi index nahi hua hai.</p>
  <p>Telegram channel mein video post karo correct caption ke saath.</p>
</body>
</html>`;
}

module.exports = { buildPlayerPage, buildNotFoundPage, buildLabel, formatBytes };
