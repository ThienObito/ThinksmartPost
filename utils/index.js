/**
 * Shared utilities for AutoContentPoster Pro
 * Consolidates: wpAuth, sanitizeContent, sanitizeImageUrl, escapeHtml, validateFilename, asyncHandler
 */

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Category change event emitter (for SSE real-time push) ──
const categoryEmitter = new EventEmitter();
const CATEGORY_EVENT = 'category-update';

// ── WP config file (written by Settings UI, read before .env) ──
const WP_CONFIG_PATH = path.join(__dirname, '..', 'data', 'wp-config.json');

function loadWpConfig() {
  try {
    return JSON.parse(fs.readFileSync(WP_CONFIG_PATH, 'utf-8'));
  } catch { return null; }
}

// ── WordPress Auth ──────────────────────────────────────────────
function wpAuth() {
  // Priority: config file > .env > default
  const cfg = loadWpConfig();
  const url = cfg?.wpUrl || process.env.WP_URL || 'https://thinksmart.vn';
  const pass = cfg?.wpPass || process.env.WP_APP_PASSWORD || '';
  const user = process.env.WP_USERNAME || 'admin';
  if (!pass) return null;
  return {
    header: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    url,
    user,
  };
}

// ── Escape HTML (XSS prevention) ────────────────────────────────
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Sanitize article content for WP publish ──────────────────────
function sanitizeContent(rawContent) {
  if (!rawContent) return '<p>No content</p>';

  // Strip <article> wrapper since WP adds its own
  let content = rawContent;
  if (typeof content === 'string') {
    content = content.replace(/<\/?article>/gi, '').trim();
  }

  // If it's a JSON string (double-encoded), parse and convert to HTML
  if (typeof content === 'string' && content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.intro || Array.isArray(parsed.sections) || parsed.cta) {
        const parts = [];
        if (parsed.intro) parts.push('<p>' + parsed.intro + '</p>');
        if (Array.isArray(parsed.sections)) {
          for (const sec of parsed.sections) {
            if (sec.heading) parts.push('<h2>' + sec.heading + '</h2>');
            if (sec.content) parts.push('<p>' + sec.content + '</p>');
            if (Array.isArray(sec.subsections)) {
              for (const sub of sec.subsections) {
                if (sub.subheading) parts.push('<h3>' + sub.subheading + '</h3>');
                if (sub.content) parts.push('<div>' + sub.content + '</div>');
              }
            }
          }
        }
        if (parsed.cta) parts.push('<p>' + parsed.cta + '</p>');
        return '<article>' + parts.join('\n') + '</article>';
      }
      // Flat JSON with content key
      if (parsed.content) return parsed.content;
    } catch { /* not JSON, use raw */ }
  }
  // If content has <article> wrapper after stripping, re-add (defensive)
  if (!content.trim().startsWith('<')) return '<article>' + content + '</article>';
  return content || rawContent;
}

// ── Sanitize image URL ──────────────────────────────────────────
function sanitizeImageUrl(url) {
  if (!url) return '';
  if (typeof url === 'object' && url !== null) return typeof url.url === 'string' ? url.url : '';
  if (typeof url === 'string') {
    if (url.startsWith('url(') || url.startsWith('{')) return '';
    return url.trim();
  }
  return '';
}

// ── Validate filename (path traversal protection) ───────────────
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  // Decode URL-encoded filenames first
  const decoded = decodeURIComponent(filename);
  // Resolve and check it stays within data dir
  const resolved = path.resolve(DATA_DIR, decoded);
  if (!resolved.startsWith(path.resolve(DATA_DIR))) {
    return null; // Path traversal attempt detected
  }
  // Must be a .json file
  if (!resolved.endsWith('.json')) return null;
  // Must actually exist
  const fs = require('fs');
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

// ── Async handler wrapper (catches errors automatically) ────────
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ── Category ID mapping (with caching from WP) ──────────────────
let categoryCache = { 'giai-phap': 13, 'ung-dung': 14 }; // defaults (synced with WP)
let categoryCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function refreshCategoryCache() {
  const fs = require('fs');
  const cacheFile = path.join(DATA_DIR, '.category-cache.json');
  try {
    // Try to read from WP first
    const axios = require('axios');
    const auth = wpAuth();
    if (auth) {
      const res = await axios.get(`${auth.url}/wp-json/wp/v2/categories?per_page=50`, {
        headers: { Authorization: auth.header },
        timeout: 10000,
      });
      if (Array.isArray(res.data)) {
        const map = {};
        for (const cat of res.data) {
          map[cat.slug] = cat.id;
        }
        if (Object.keys(map).length > 0) {
          categoryCache = map;
          fs.writeFileSync(cacheFile, JSON.stringify({ cache: map, time: Date.now() }, null, 2), 'utf-8');
          categoryEmitter.emit(CATEGORY_EVENT, map); // notify SSE clients
          return;
        }
      }
    }
  } catch {
    // Fallback: read from local cache file
    try {
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (cached.cache && Object.keys(cached.cache).length > 0) {
          categoryCache = cached.cache;
        }
      }
    } catch { /* keep defaults */ }
  }
}

function getCategoryId(slug) {
  return categoryCache[slug] || 2; // fallback to default 'giai-phap'
}

// Refresh cache on module load (don't block startup)
refreshCategoryCache();

// Periodically refresh
setInterval(refreshCategoryCache, CACHE_TTL);

module.exports = {
  wpAuth,
  escapeHtml,
  sanitizeContent,
  sanitizeImageUrl,
  validateFilename,
  asyncHandler,
  getCategoryId,
  refreshCategoryCache,
  categoryCache,
  categoryEmitter,
  CATEGORY_EVENT,
};
