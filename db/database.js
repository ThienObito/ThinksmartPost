/**
 * Database Manager — SQLite Cache Layer
 * 
 * Lưu trữ cache dữ liệu từ Google Analytics 4 & Google Search Console
 * để tránh gọi API quá nhiều lần (tiết kiệm quota).
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'analytics-cache.db');

let db = null;

/** Khởi tạo database & schema */
function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Bảng cache chính — lưu dữ liệu GA4/GSC theo ngày
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      cache_type TEXT NOT NULL CHECK(cache_type IN ('ga4','gsc')),
      data TEXT NOT NULL,
      date TEXT NOT NULL,
      period INTEGER DEFAULT 30,
      url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // Bảng log đồng bộ — ghi lại lịch sử sync
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL CHECK(sync_type IN ('ga4','gsc','full')),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','success','error')),
      error_message TEXT DEFAULT '',
      rows_synced INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    )
  `);

  // Index cho tra cứu nhanh
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cache_key ON analytics_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_cache_date ON analytics_cache(date);
    CREATE INDEX IF NOT EXISTS idx_cache_type ON analytics_cache(cache_type);
    CREATE INDEX IF NOT EXISTS idx_sync_date ON analytics_sync_log(date);
  `);

  console.log('[DB] SQLite cache initialized at', DB_PATH);
  return db;
}

/** Lấy dữ liệu cache theo key */
function getCache(cacheKey) {
  if (!db) initDatabase();
  const row = db.prepare('SELECT data, updated_at FROM analytics_cache WHERE cache_key = ?').get(cacheKey);
  if (row) {
    return { data: JSON.parse(row.data), updatedAt: row.updated_at };
  }
  return null;
}

/** Lưu dữ liệu vào cache (upsert) */
function setCache(cacheKey, cacheType, data, date, period = 30, url = '') {
  if (!db) initDatabase();
  const stmt = db.prepare(`
    INSERT INTO analytics_cache (cache_key, cache_type, data, date, period, url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(cache_key) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `);
  stmt.run(cacheKey, cacheType, JSON.stringify(data), date, period, url);
}

/** Kiểm tra cache có tồn tại cho ngày hôm nay không */
function hasCacheForDate(cacheType, date) {
  if (!db) initDatabase();
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM analytics_cache WHERE cache_type = ? AND date = ?'
  ).get(cacheType, date);
  return row && row.cnt > 0;
}

/** Kiểm tra cache theo khoảng thời gian */
function hasCacheForPeriod(cacheType, startDate, endDate) {
  if (!db) initDatabase();
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM analytics_cache WHERE cache_type = ? AND date >= ? AND date <= ?'
  ).get(cacheType, startDate, endDate);
  return row && row.cnt > 0;
}

/** Lấy toàn bộ cache trong khoảng thời gian */
function getCacheRange(cacheType, startDate, endDate) {
  if (!db) initDatabase();
  const rows = db.prepare(
    'SELECT data, date FROM analytics_cache WHERE cache_type = ? AND date >= ? AND date <= ? ORDER BY date ASC'
  ).all(cacheType, startDate, endDate);
  return rows.map(r => ({ ...JSON.parse(r.data), date: r.date }));
}

/** Ghi log đồng bộ */
function logSync(syncType, date, status, errorMessage = '', rowsSynced = 0) {
  if (!db) initDatabase();
  if (status === 'running') {
    db.prepare(`
      INSERT INTO analytics_sync_log (sync_type, date, status, started_at)
      VALUES (?, ?, 'running', datetime('now','localtime'))
    `).run(syncType, date);
  } else {
    const lastRun = db.prepare(
      'SELECT id FROM analytics_sync_log WHERE sync_type = ? AND date = ? AND status = ? ORDER BY id DESC LIMIT 1'
    ).get(syncType, date, 'running');
    if (lastRun) {
      db.prepare(`
        UPDATE analytics_sync_log SET status = ?, error_message = ?, rows_synced = ?,
          completed_at = datetime('now','localtime')
        WHERE id = ?
      `).run(status, errorMessage, rowsSynced, lastRun.id);
    } else {
      db.prepare(`
        INSERT INTO analytics_sync_log (sync_type, date, status, error_message, rows_synced, completed_at)
        VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
      `).run(syncType, date, status, errorMessage, rowsSynced);
    }
  }
}

/** Lấy trạng thái sync gần nhất */
function getLastSyncStatus(syncType) {
  if (!db) initDatabase();
  return db.prepare(`
    SELECT date, status, error_message, started_at, completed_at, rows_synced
    FROM analytics_sync_log WHERE sync_type = ? ORDER BY id DESC LIMIT 1
  `).get(syncType) || null;
}

/** Đóng database */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getCache,
  setCache,
  hasCacheForDate,
  hasCacheForPeriod,
  getCacheRange,
  logSync,
  getLastSyncStatus,
  closeDatabase,
};
