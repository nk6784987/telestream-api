const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || './data/db.sqlite';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id     TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('movie','tv','anime')),
    season      INTEGER NOT NULL DEFAULT 0,
    episode     INTEGER NOT NULL DEFAULT 0,
    quality     TEXT    NOT NULL DEFAULT '720p',
    file_id     TEXT    NOT NULL,
    file_name   TEXT,
    file_size   INTEGER DEFAULT 0,
    duration    INTEGER DEFAULT 0,
    title       TEXT,
    poster_path TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tmdb_id, type, season, episode, quality)
  );

  -- Pending uploads waiting for admin confirmation
  CREATE TABLE IF NOT EXISTS pending (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id     TEXT    NOT NULL,
    file_name   TEXT,
    file_size   INTEGER DEFAULT 0,
    duration    INTEGER DEFAULT 0,
    chat_id     TEXT,
    msg_id      INTEGER,
    state       TEXT    DEFAULT 'awaiting_type',
    content_type TEXT,
    search_query TEXT,
    season      INTEGER DEFAULT 0,
    episode     INTEGER DEFAULT 0,
    quality     TEXT    DEFAULT '720p',
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tmdb      ON videos(tmdb_id);
  CREATE INDEX IF NOT EXISTS idx_tmdb_type ON videos(tmdb_id, type);
  CREATE INDEX IF NOT EXISTS idx_file_id   ON videos(file_id);
`);

// ── Video queries ─────────────────────────────────────────────────────────────
const upsertVideo = db.prepare(`
  INSERT INTO videos
    (tmdb_id, type, season, episode, quality, file_id, file_name, file_size, duration, title, poster_path)
  VALUES
    (@tmdb_id, @type, @season, @episode, @quality, @file_id, @file_name, @file_size, @duration, @title, @poster_path)
  ON CONFLICT(tmdb_id, type, season, episode, quality)
  DO UPDATE SET
    file_id     = excluded.file_id,
    file_name   = excluded.file_name,
    file_size   = excluded.file_size,
    title       = excluded.title,
    poster_path = excluded.poster_path,
    updated_at  = datetime('now')
`);

function fetchBest(tmdb_id, type, season = 0, episode = 0, quality = null) {
  if (quality) {
    return db.prepare(`SELECT * FROM videos WHERE tmdb_id=? AND type=? AND season=? AND episode=? AND quality=? LIMIT 1`)
      .get(tmdb_id, type, season, episode, quality);
  }
  return db.prepare(`
    SELECT * FROM videos WHERE tmdb_id=? AND type=? AND season=? AND episode=?
    ORDER BY CASE quality WHEN '4K' THEN 0 WHEN '2160p' THEN 1 WHEN '1080p' THEN 2 WHEN '720p' THEN 3 WHEN '480p' THEN 4 ELSE 5 END
    LIMIT 1
  `).get(tmdb_id, type, season, episode);
}

function fetchAllMovie(tmdb_id) {
  return db.prepare(`SELECT * FROM videos WHERE tmdb_id=? AND type='movie' ORDER BY quality DESC`).all(tmdb_id);
}

function fetchAllTV(tmdb_id, season, episode) {
  return db.prepare(`SELECT * FROM videos WHERE tmdb_id=? AND type IN ('tv','anime') AND season=? AND episode=? ORDER BY quality DESC`)
    .all(tmdb_id, season, episode);
}

function fetchByFileId(file_id) {
  return db.prepare(`SELECT * FROM videos WHERE file_id=? LIMIT 1`).get(file_id);
}

function fetchList(tmdb_id, type = null) {
  if (type) return db.prepare(`SELECT * FROM videos WHERE tmdb_id=? AND type=? ORDER BY season,episode,quality`).all(tmdb_id, type);
  return db.prepare(`SELECT * FROM videos WHERE tmdb_id=? ORDER BY season,episode,quality`).all(tmdb_id);
}

function getStats() {
  return db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN type='movie' THEN 1 ELSE 0 END) AS movies,
      SUM(CASE WHEN type='tv'    THEN 1 ELSE 0 END) AS tv,
      SUM(CASE WHEN type='anime' THEN 1 ELSE 0 END) AS anime,
      SUM(file_size) AS total_bytes
    FROM videos
  `).get();
}

// ── Pending session queries ───────────────────────────────────────────────────
function createPending(data) {
  return db.prepare(`
    INSERT INTO pending (file_id, file_name, file_size, duration, chat_id, msg_id)
    VALUES (@file_id, @file_name, @file_size, @duration, @chat_id, @msg_id)
  `).run(data);
}

function getPending(id) {
  return db.prepare(`SELECT * FROM pending WHERE id=?`).get(id);
}

function updatePending(id, fields) {
  const keys = Object.keys(fields).map(k => `${k}=@${k}`).join(', ');
  db.prepare(`UPDATE pending SET ${keys} WHERE id=@id`).run({ ...fields, id });
}

function deletePending(id) {
  db.prepare(`DELETE FROM pending WHERE id=?`).run(id);
}

// Clean up old pending sessions (older than 1 hour)
function cleanPending() {
  db.prepare(`DELETE FROM pending WHERE created_at < datetime('now', '-1 hour')`).run();
}

module.exports = {
  upsertVideo, fetchBest, fetchAllMovie, fetchAllTV,
  fetchByFileId, fetchList, getStats,
  createPending, getPending, updatePending, deletePending, cleanPending,
};

/** Latest pending session for a user in a given state */
function getLatestPending(chatId, states) {
  const placeholders = states.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM pending WHERE chat_id=? AND state IN (${placeholders}) ORDER BY id DESC LIMIT 1`
  ).get(chatId, ...states);
}

module.exports.getLatestPending = getLatestPending;
