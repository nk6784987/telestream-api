const express = require('express');
const router  = express.Router();
const {
  fetchAllMovie, fetchAllTV, fetchList, getStats
} = require('../database');
const { formatBytes } = require('../player');

const BASE_URL = () => process.env.BASE_URL || '';

function streamEntry(row) {
  const base = BASE_URL();
  const streamUrl = `${base}/stream/${row.file_id}`;
  const embedUrl  = row.type === 'movie'
    ? `${base}/embed/${row.tmdb_id}?type=movie&q=${row.quality}`
    : `${base}/embed/${row.tmdb_id}?type=${row.type}&s=${row.season}&e=${row.episode}&q=${row.quality}`;

  return {
    quality:        row.quality,
    stream_url:     streamUrl,
    embed_url:      embedUrl,
    file_size:      row.file_size,
    file_size_human: formatBytes(row.file_size),
    duration_secs:  row.duration,
    title:          row.title,
  };
}

/**
 * GET /api/v1/movie/:tmdb_id
 * All qualities for a movie
 */
router.get('/movie/:tmdb_id', (req, res) => {
  const rows = fetchAllMovie(req.params.tmdb_id);
  if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });

  res.json({
    success: true,
    tmdb_id: req.params.tmdb_id,
    type: 'movie',
    title: rows[0].title,
    streams: rows.map(streamEntry),
  });
});

/**
 * GET /api/v1/tv/:tmdb_id/season/:s/episode/:e
 */
router.get('/tv/:tmdb_id/season/:s/episode/:e', (req, res) => {
  const { tmdb_id, s, e } = req.params;
  const rows = fetchAllTV(tmdb_id, parseInt(s), parseInt(e));
  if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });

  res.json({
    success: true,
    tmdb_id,
    type:    rows[0].type,
    season:  parseInt(s),
    episode: parseInt(e),
    title:   rows[0].title,
    streams: rows.map(streamEntry),
  });
});

/**
 * GET /api/v1/list/:tmdb_id?type=tv
 * All indexed episodes/movies for a TMDB id
 */
router.get('/list/:tmdb_id', (req, res) => {
  const type = req.query.type || null;
  const rows = fetchList(req.params.tmdb_id, type);
  res.json({ success: true, count: rows.length, results: rows });
});

/**
 * GET /api/v1/stats
 * Database stats
 */
router.get('/stats', (req, res) => {
  const stats = getStats();
  res.json({
    success: true,
    total_videos: stats.total,
    movies:       stats.movies,
    tv_episodes:  stats.tv,
    anime:        stats.anime,
    total_size:   formatBytes(stats.total_bytes),
  });
});

module.exports = router;
