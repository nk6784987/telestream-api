/**
 * tmdb.js — TMDB API wrapper
 * Search movies and TV shows, get episode details
 */

const axios = require('axios');

const BASE = 'https://api.themoviedb.org/3';
const KEY  = () => process.env.TMDB_API_KEY;
const IMG  = 'https://image.tmdb.org/t/p/w300';

async function tmdbGet(path, params = {}) {
  try {
    const { data } = await axios.get(`${BASE}${path}`, {
      params: { api_key: KEY(), language: 'en-US', ...params },
      timeout: 8000,
    });
    return data;
  } catch (e) {
    console.error('[TMDB] Error:', e.response?.data || e.message);
    return null;
  }
}

/**
 * Search movies by title (+ optional year)
 * Returns top 5 results
 */
async function searchMovies(query, year = null) {
  const params = { query, include_adult: false };
  if (year) params.year = year;
  const data = await tmdbGet('/search/movie', params);
  if (!data?.results) return [];
  return data.results.slice(0, 5).map(m => ({
    tmdb_id:    String(m.id),
    title:      m.title,
    year:       (m.release_date || '').slice(0, 4),
    overview:   (m.overview || '').slice(0, 120),
    poster_url: m.poster_path ? `${IMG}${m.poster_path}` : null,
    type:       'movie',
  }));
}

/**
 * Search TV shows by title
 * Returns top 5 results
 */
async function searchTV(query) {
  const data = await tmdbGet('/search/tv', { query, include_adult: false });
  if (!data?.results) return [];
  return data.results.slice(0, 5).map(s => ({
    tmdb_id:    String(s.id),
    title:      s.name,
    year:       (s.first_air_date || '').slice(0, 4),
    overview:   (s.overview || '').slice(0, 120),
    poster_url: s.poster_path ? `${IMG}${s.poster_path}` : null,
    type:       'tv',
  }));
}

/**
 * Get episode name for a specific S/E
 */
async function getEpisodeName(tmdb_id, season, episode) {
  const data = await tmdbGet(`/tv/${tmdb_id}/season/${season}/episode/${episode}`);
  return data?.name || null;
}

module.exports = { searchMovies, searchTV, getEpisodeName };
