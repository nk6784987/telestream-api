const express = require('express');
const router  = express.Router();
const { fetchBest, fetchAllMovie, fetchAllTV } = require('../database');
const { buildPlayerPage, buildNotFoundPage }   = require('../player');

const BASE_URL = () => process.env.BASE_URL || '';

/**
 * GET /embed/:tmdb_id?type=movie|tv|anime&s=1&e=1&q=1080p
 */
router.get('/:tmdb_id', (req, res) => {
  const { tmdb_id } = req.params;
  const type    = req.query.type    || 'movie';
  const season  = parseInt(req.query.s || '0', 10);
  const episode = parseInt(req.query.e || '0', 10);
  const quality = req.query.q       || null;

  // Best match fetch karo
  const row = fetchBest(tmdb_id, type, season, episode, quality);

  if (!row) {
    res.set('Content-Type', 'text/html; charset=UTF-8');
    return res.status(404).send(buildNotFoundPage(tmdb_id));
  }

  // All qualities for switcher
  const allRows = type === 'movie'
    ? fetchAllMovie(tmdb_id)
    : fetchAllTV(tmdb_id, season, episode);

  const allQualities = allRows.map(r => ({
    quality:    r.quality,
    stream_url: `${BASE_URL()}/stream/${r.file_id}`,
    embed_url:  buildEmbedUrl(r, BASE_URL()),
  }));

  const streamUrl = `${BASE_URL()}/stream/${row.file_id}`;
  const html = buildPlayerPage(row, streamUrl, allQualities);

  res.set('Content-Type', 'text/html; charset=UTF-8');
  res.set('X-Frame-Options', 'ALLOWALL');
  res.set('Content-Security-Policy', "frame-ancestors *");
  res.send(html);
});

function buildEmbedUrl(row, base) {
  if (row.type === 'movie') {
    return `${base}/embed/${row.tmdb_id}?type=movie&q=${row.quality}`;
  }
  return `${base}/embed/${row.tmdb_id}?type=${row.type}&s=${row.season}&e=${row.episode}&q=${row.quality}`;
}

module.exports = router;
