/**
 * Multi-site Management — Quản lý nhiều WordPress sites
 * Lưu trữ: data/sites.json (hoặc SQLite nếu có better-sqlite3)
 * Mã hóa appPassword khi lưu
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SITES_FILE = path.join(DATA_DIR, 'sites.json');
const { v4: uuidv4 } = require('uuid');

// ── Encryption ───────────────────────────────────────────────────

function getEncryptionKey() {
  const key = process.env.SITES_ENCRYPTION_KEY || 'thinksmart-default-key-32chars!!';
  return crypto.createHash('sha256').update(key).digest().slice(0, 32);
}

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted) {
  if (!encrypted || !encrypted.includes(':')) return encrypted;
  try {
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encText = parts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let decrypted = decipher.update(encText, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch {
    return encrypted;
  }
}

// ── Load / Save ──────────────────────────────────────────────────

function loadSites() {
  try {
    if (fs.existsSync(SITES_FILE)) {
      return JSON.parse(fs.readFileSync(SITES_FILE, 'utf-8'));
    }
  } catch { /* fall through */ }
  return [];
}

function saveSites(sites) {
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2), 'utf-8');
}

// ── CRUD ─────────────────────────────────────────────────────────

function getAllSites() {
  const sites = loadSites();
  return sites.map(s => ({
    ...s,
    appPassword: undefined, // Không trả về password
  }));
}

function getSiteById(id) {
  const sites = loadSites();
  return sites.find(s => s.id === id) || null;
}

function createSite({ name, url, username, appPassword, categories, defaultCategory }) {
  const sites = loadSites();
  const newSite = {
    id: uuidv4(),
    name: name.trim(),
    url: url.replace(/\/+$/, ''), // Xóa trailing slash
    username: username.trim(),
    appPassword: encrypt(appPassword),
    categories: categories || [],
    defaultCategory: defaultCategory || '',
    isActive: true,
    createdAt: new Date().toISOString(),
    lastSync: null,
    postCount: 0,
  };
  sites.push(newSite);
  saveSites(sites);
  const { appPassword: _, ...safe } = newSite;
  return safe;
}

function updateSite(id, updates) {
  const sites = loadSites();
  const idx = sites.findIndex(s => s.id === id);
  if (idx === -1) return null;

  if (updates.appPassword) {
    updates.appPassword = encrypt(updates.appPassword);
  }
  Object.assign(sites[idx], updates, { updatedAt: new Date().toISOString() });
  saveSites(sites);
  const { appPassword: _, ...safe } = sites[idx];
  return safe;
}

function deleteSite(id) {
  const sites = loadSites();
  const idx = sites.findIndex(s => s.id === id);
  if (idx === -1) return false;
  sites.splice(idx, 1);
  saveSites(sites);
  return true;
}

// ── Test connection ──────────────────────────────────────────────

async function testConnection(id) {
  const site = getSiteById(id);
  if (!site) return { success: false, error: 'Site not found' };

  // Get full site with decrypted password
  const sites = loadSites();
  const fullSite = sites.find(s => s.id === id);
  const password = decrypt(fullSite.appPassword);

  const axios = require('axios');
  const auth = Buffer.from(`${fullSite.username}:${password}`).toString('base64');

  try {
    const { data } = await axios.get(`${fullSite.url}/wp-json/wp/v2/posts?per_page=1`, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000,
    });
    return { success: true, siteName: fullSite.name, postCount: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return { success: false, error: e.response?.data?.message || e.message };
  }
}

// ── Lấy categories từ WP site ────────────────────────────────────

async function fetchCategories(id) {
  const sites = loadSites();
  const site = sites.find(s => s.id === id);
  if (!site) return [];

  const password = decrypt(site.appPassword);
  const axios = require('axios');
  const auth = Buffer.from(`${site.username}:${password}`).toString('base64');

  try {
    const { data } = await axios.get(`${site.url}/wp-json/wp/v2/categories?per_page=50`, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000,
    });
    return Array.isArray(data) ? data.map(c => ({ id: c.id, name: c.name, slug: c.slug })) : [];
  } catch {
    return [];
  }
}

// ── Lấy credentials của site (giải mã) ───────────────────────────

function getSiteCredentials(id) {
  const sites = loadSites();
  const site = sites.find(s => s.id === id);
  if (!site) return null;
  return {
    url: site.url,
    username: site.username,
    appPassword: decrypt(site.appPassword),
  };
}

// ── Migration: migrate from .env single-site ─────────────────────

function migrateFromEnv() {
  const sites = loadSites();
  if (sites.length > 0) return; // Đã có site, skip

  const wpUrl = process.env.WP_URL;
  const wpUser = process.env.WP_USERNAME || 'admin';
  const wpPass = process.env.WP_APP_PASSWORD;

  if (wpUrl && wpPass) {
    const defaultSite = {
      id: uuidv4(),
      name: 'Site chính (từ .env)',
      url: wpUrl.replace(/\/+$/, ''),
      username: wpUser,
      appPassword: encrypt(wpPass),
      categories: [],
      isActive: true,
      createdAt: new Date().toISOString(),
      lastSync: null,
      postCount: 0,
    };
    sites.push(defaultSite);
    saveSites(sites);
    console.log('✅ Migrated single-site from .env to sites.json');
  }
}

module.exports = {
  getAllSites,
  getSiteById,
  createSite,
  updateSite,
  deleteSite,
  testConnection,
  fetchCategories,
  getSiteCredentials,
  loadSites,
  saveSites,
  migrateFromEnv,
};
