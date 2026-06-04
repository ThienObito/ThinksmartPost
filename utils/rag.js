/**
 * RAG Service — Knowledge Base với SQLite FTS5
 *
 * Kiến trúc:
 *   data/knowledge_base.db  ← SQLite với FTS5 tables
 *     ├── articles_fts  (full-text search bài viết cũ)
 *     ├── templates_fts (search template)
 *
 * Sử dụng:
 *   const rag = require('./utils/rag');
 *   const ctx = await rag.query('in 3D trong y tế', { limit: 5 });
 *   // → [{ title, snippet, score, source }]
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'knowledge_base.db');
const DATA_DIR = path.join(__dirname, '..', 'data');

let db = null;

// ── Khởi tạo DB + schema ────────────────────────────────────────

function initDb() {
  if (db) return db;

  const exists = fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  if (!exists) {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title, content, summary, category, tokenize='unicode61'
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS articles_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, content TEXT, summary TEXT, category TEXT,
      filename TEXT UNIQUE, indexed_at TEXT
    )`);
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS templates_fts USING fts5(
      name, prompt, tone, tags, tokenize='unicode61'
    )`);
    console.log('[RAG] DB created at', DB_PATH);
  }
  return db;
}

// ── Index articles ───────────────────────────────────────────────

function indexArticles(force = false) {
  const d = initDb();

  // Check if already indexed
  if (!force) {
    const count = d.prepare('SELECT COUNT(*) as c FROM articles_raw').get().c;
    if (count > 0) {
      console.log(`[RAG] Articles already indexed (${count}), skip. Use force=true to rebuild.`);
      return 0;
    }
  }

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json')
      && !f.startsWith('queue')
      && !f.startsWith('.')
      && f !== 'users.json' && f !== 'templates.json'
      && f !== 'api-usage.json' && f !== 'library.json'
      && f !== 'notes.json' && f !== 'wp-config.json' && f !== 'sites.json');

  if (files.length === 0) return 0;

  // Clear old data
  d.exec('DELETE FROM articles_fts');
  d.exec('DELETE FROM articles_raw');

  const now = new Date().toISOString();
  const ins = d.prepare('INSERT INTO articles_raw (title, content, summary, category, filename, indexed_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insFts = d.prepare('INSERT INTO articles_fts (rowid, title, content, summary, category) VALUES (?, ?, ?, ?, ?)');

  let indexed = 0;

  const txn = d.transaction(() => {
    for (const file of files) {
      try {
        const a = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
        const title = (a.title || '').substring(0, 500);
        const content = (a.content || '').replace(/<[^>]*>/g, '').substring(0, 5000);
        const summary = (a.summary || '').substring(0, 500);
        const cat = a.category_slug || 'other';

        const info = ins.run(title, content, summary, cat, file, now);
        insFts.run(info.lastInsertRowid, title, content, summary, cat);
        indexed++;
      } catch (e) {
        console.error(`[RAG] Skip ${file}: ${e.message.substring(0, 80)}`);
      }
    }
  });

  txn();
  console.log(`[RAG] Indexed ${indexed} articles`);
  return indexed;
}

// ── Index templates ──────────────────────────────────────────────

function indexTemplates(force = false) {
  const d = initDb();

  if (!force) {
    const count = d.prepare('SELECT COUNT(*) as c FROM templates_fts').get().c;
    if (count > 0) return 0;
  }

  const tmplFile = path.join(DATA_DIR, 'templates.json');
  if (!fs.existsSync(tmplFile)) return 0;

  try {
    const tmpls = JSON.parse(fs.readFileSync(tmplFile, 'utf-8'));
    if (tmpls.length === 0) return 0;

    d.exec('DELETE FROM templates_fts');

    const insT = d.prepare('INSERT INTO templates_fts (name, prompt, tone, tags) VALUES (?, ?, ?, ?)');
    const txn = d.transaction(() => {
      for (const t of tmpls) {
        insT.run(
          (t.name || '').substring(0, 200),
          (t.prompt_template || '').substring(0, 500),
          (t.tone || '').substring(0, 200),
          Array.isArray(t.tags) ? t.tags.join(' ') : ''
        );
      }
    });
    txn();

    console.log(`[RAG] Indexed ${tmpls.length} templates`);
    return tmpls.length;
  } catch (e) {
    console.error('[RAG] Index templates error:', e.message);
    return 0;
  }
}

// ── Query RAG ────────────────────────────────────────────────────

function query(queryText, options = {}) {
  const {
    limit = 5,
    sources = ['articles', 'templates'],
    minScore = 0,
  } = options;

  if (!queryText || !queryText.trim()) return [];
  initDb();

  const results = [];

  // 1. Search articles
  if (sources.includes('articles')) {
    try {
      const q = queryText.trim().replace(/[^\wÀ-ỹ\s]/gi, '').substring(0, 200);
      if (!q) return [];

      const rows = db.prepare(`
        SELECT a.title, a.category, a.filename, rank,
               substr(a.content, 1, 200) as snippet
        FROM articles_fts
        JOIN articles_raw a ON articles_fts.rowid = a.id
        WHERE articles_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(q, limit);

      for (const r of rows) {
        results.push({
          source: 'article',
          title: r.title,
          snippet: r.snippet?.substring(0, 150) || '',
          category: r.category,
          filename: r.filename,
          score: Math.max(0, Math.round((1 - Math.abs(r.rank || 0)) * 100)),
        });
      }
    } catch (e) {
      console.error('[RAG] FTS article query error:', e.message);
    }
  }

  // 2. Search templates
  if (sources.includes('templates') && results.length < limit) {
    try {
      const q = queryText.trim().substring(0, 100);
      const rows = db.prepare(`
        SELECT name, tone, rank
        FROM templates_fts
        WHERE templates_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(q, limit - results.length);

      for (const r of rows) {
        results.push({
          source: 'template',
          title: r.name,
          snippet: r.tone?.substring(0, 150) || '',
          score: Math.max(0, Math.round((1 - Math.abs(r.rank || 0)) * 100)),
        });
      }
    } catch (e) {
      console.error('[RAG] FTS template query error:', e.message);
    }
  }

  return results
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Build context string cho AI prompt ────────────────────────────

function buildContext(queryText, options = {}) {
  const results = query(queryText, options);
  if (results.length === 0) return '';

  const lines = ['\n\n=== KIẾN THỨC LIÊN QUAN (RAG) ==='];

  for (const r of results) {
    if (r.source === 'article') {
      lines.push(`- Bài "${r.title}" (${r.category})`);
      if (r.snippet) lines.push(`  ${r.snippet}`);
    } else if (r.source === 'template') {
      lines.push(`- Template: "${r.title}"`);
    }
  }

  lines.push('=== KẾT THÚC RAG ===');
  return lines.join('\n');
}

// ── Sync tất cả ──────────────────────────────────────────────────

function syncAll(force = false) {
  initDb();
  const a = indexArticles(force);
  const t = indexTemplates(force);
  return { articlesIndexed: a, templatesIndexed: t };
}

module.exports = {
  initDb,
  query,
  buildContext,
  indexArticles,
  indexTemplates,
  syncAll,
};
