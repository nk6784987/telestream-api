const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { resolveFilePath } = require('../telegram');
const { fetchBest, fetchByFileId } = require('../database');

/**
 * GET /stream/:id
 *
 * :id can be:
 *   - Telegram file_id  (long string like BQACAgIA...)
 *   - TMDB numeric id   (pass ?type=movie or ?type=tv&s=1&e=3)
 *
 * Supports HTTP Range headers → HTTP 206 Partial Content
 * This is what enables video seeking in the browser.
 */
router.get('/:id', async (req, res) => {
  let fileId = req.params.id;

  // Numeric = tmdb_id, resolve to file_id first
  if (/^\d+$/.test(fileId)) {
    const type    = req.query.type    || 'movie';
    const season  = parseInt(req.query.s || '0', 10);
    const episode = parseInt(req.query.e || '0', 10);
    const quality = req.query.q       || null;

    const row = fetchBest(fileId, type, season, episode, quality);
    if (!row) {
      return res.status(404).send('Video not found in database');
    }
    fileId = row.file_id;
  }

  // Telegram se file_path resolve karo (cached)
  const filePath = await resolveFilePath(fileId);
  if (!filePath) {
    return res.status(502).send('Could not resolve Telegram file path. Check BOT_TOKEN.');
  }

  const telegramUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
  const rangeHeader = req.headers['range'];

  // Upstream headers
  const upstreamHeaders = { 'User-Agent': 'TeleStream/1.0' };
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

  try {
    const upstream = await axios({
      method:       'get',
      url:          telegramUrl,
      headers:      upstreamHeaders,
      responseType: 'stream',
      timeout:      30000,
      validateStatus: (s) => s < 500,
    });

    // Response headers build karo
    const headers = {
      'Content-Type':  upstream.headers['content-type'] || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    };

    if (upstream.headers['content-length'])
      headers['Content-Length'] = upstream.headers['content-length'];

    if (upstream.headers['content-range'])
      headers['Content-Range'] = upstream.headers['content-range'];

    const status = rangeHeader ? 206 : (upstream.status || 200);
    res.writeHead(status, headers);

    // Stream pipe karo
    upstream.data.pipe(res);

    upstream.data.on('error', (err) => {
      console.error('[Stream] Pipe error:', err.message);
      if (!res.headersSent) res.status(502).end();
    });

  } catch (err) {
    console.error('[Stream] Upstream error:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Upstream fetch failed: ' + err.message);
    }
  }
});

module.exports = router;
