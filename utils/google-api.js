/**
 * Google API Service — GA4 + Google Search Console
 * 
 * KIẾN TRÚC CACHE-FIRST:
 * 1. Kiểm tra DB cache trước
 * 2. Nếu có → trả về ngay (KHÔNG gọi Google API)
 * 3. Nếu không → gọi Google API → lưu cache → trả về
 * 
 * Yêu cầu cấu hình trong .env:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n..."
 *   GA4_PROPERTY_ID=123456789
 *   GSC_SITE_URL=https://thinksmart.vn
 *   GSC_SITE_URL=https://thinksmart.vn (ScopedProperty)
 */
const axios = require('axios');
const db = require('../db/database');

// ── Config ───────────────────────────────────────────────────────

const config = {
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  ga4PropertyId: process.env.GA4_PROPERTY_ID || '',
  gscSiteUrl: process.env.GSC_SITE_URL || 'sc%3Ahttps%3A%2F%2Fthinksmart.vn',
};

const isConfigured = () => !!(config.serviceAccountEmail && config.privateKey && config.ga4PropertyId);

// ── JWT Helpers ──────────────────────────────────────────────────

/**
 * Tạo JWT assertion để lấy Google OAuth2 access token
 * Sử dụng Service Account credentials
 */
function createJwtAssertion() {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: config.privateKeyId || '' };
  const claimSet = {
    iss: config.serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const encodeB64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signatureInput = `${encodeB64(header)}.${encodeB64(claimSet)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(config.privateKey, 'base64url');
  return `${signatureInput}.${signature}`;
}

/**
 * Lấy OAuth2 access token từ Service Account JWT
 * Kết quả được cache 30 phút để tránh tạo JWT mới liên tục
 */
let _tokenCache = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_tokenCache && Date.now() < _tokenExpiry) {
    return _tokenCache;
  }
  if (!isConfigured()) {
    throw new Error('Google Service Account chưa được cấu hình trong .env');
  }

  const assertion = createJwtAssertion();
  try {
    const res = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }, { timeout: 10000 });

    _tokenCache = res.data.access_token;
    _tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000; // 60s buffer
    return _tokenCache;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Google Auth thất bại: ${detail}`);
  }
}

// ── GA4 API ──────────────────────────────────────────────────────

const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta';

/**
 * Gọi GA4 runReport — chỉ gọi khi cache miss
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {object} Raw GA4 response
 */
async function queryGA4(startDate, endDate) {
  const token = await getAccessToken();
  const res = await axios.post(
    `${GA4_BASE}/properties/${config.ga4PropertyId}:runReport`,
    {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'activeUsers' },
        { name: 'engagementRate' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      dimensions: [{ name: 'date' }],
      keepEmptyRows: true,
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );
  return res.data;
}

/**
 * Lấy dữ liệu GA4 với cache-first
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {number} period - 7|30|90|365
 * @param {boolean} forceRefresh - Bỏ qua cache, force gọi Google API
 */
async function getGA4Data(startDate, endDate, period = 30, forceRefresh = false) {
  const cacheKey = `ga4_${startDate}_${endDate}`;

  // 1. Kiểm tra cache trước (trừ khi forceRefresh)
  if (!forceRefresh) {
    const cached = db.getCache(cacheKey);
    if (cached) {
      console.log(`[GA4] Cache HIT: ${cacheKey}`);
      return { data: cached.data, fromCache: true, updatedAt: cached.updatedAt };
    }
  }

  // 2. Kiểm tra cấu hình Google API
  if (!isConfigured()) {
    console.log('[GA4] Google API chưa cấu hình, trả về dữ liệu local');
    return {
      data: {
        rows: [],
        total: { views: 0, visitors: 0, engagementRate: 0, bounceRate: 0, avgDuration: 0 },
      },
      fromCache: false,
      configured: false,
    };
  }

  // 3. Cache miss → gọi Google API
  console.log(`[GA4] Cache MISS: ${cacheKey}, calling Google API...`);
  try {
    const raw = await queryGA4(startDate, endDate);

    // Parse response
    const rows = (raw.rows || []).map(r => {
      const date = r.dimensionValues?.[0]?.value || '';
      const metrics = r.metricValues || [];
      return {
        date,
        views: parseInt(metrics[0]?.value || 0),
        visitors: parseInt(metrics[1]?.value || 0),
        engagementRate: parseFloat(metrics[2]?.value || 0),
        bounceRate: parseFloat(metrics[3]?.value || 0),
        avgDuration: parseFloat(metrics[4]?.value || 0),
      };
    });

    // Aggregate totals
    const total = {
      views: rows.reduce((s, r) => s + r.views, 0),
      visitors: rows.reduce((s, r) => s + r.visitors, 0),
      engagementRate: rows.length ? rows.reduce((s, r) => s + r.engagementRate, 0) / rows.length : 0,
      bounceRate: rows.length ? rows.reduce((s, r) => s + r.bounceRate, 0) / rows.length : 0,
      avgDuration: rows.length ? rows.reduce((s, r) => s + r.avgDuration, 0) / rows.length : 0,
    };

    const result = { rows, total };

    // 4. Lưu cache
    db.setCache(cacheKey, 'ga4', result, endDate, period);

    return { data: result, fromCache: false, configured: true };
  } catch (err) {
    console.error('[GA4] API Error:', err.message);
    return {
      data: {
        rows: [],
        total: { views: 0, visitors: 0, engagementRate: 0, bounceRate: 0, avgDuration: 0 },
      },
      fromCache: false,
      configured: true,
      error: err.message,
    };
  }
}

// ── Google Search Console API ────────────────────────────────────

const GSC_BASE = 'https://searchconsole.googleapis.com/v1';

/**
 * Gọi GSC Search Analytics query
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {string} dimension - 'query' | 'page'
 * @param {number} rowLimit - số lượng rows (max 25000)
 */
async function queryGSC(startDate, endDate, dimension = 'query', rowLimit = 100) {
  const token = await getAccessToken();
  const res = await axios.post(
    `${GSC_BASE}/sites/${encodeURIComponent(config.gscSiteUrl)}/searchAnalytics/query`,
    {
      startDate,
      endDate,
      dimensions: [dimension],
      rowLimit,
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );
  return res.data;
}

/**
 * Lấy dữ liệu GSC với cache-first
 * @param {string} startDate
 * @param {string} endDate
 * @param {number} period
 * @param {boolean} forceRefresh
 */
async function getGSCData(startDate, endDate, period = 30, forceRefresh = false) {
  const cacheKey = `gsc_${startDate}_${endDate}`;

  if (!forceRefresh) {
    const cached = db.getCache(cacheKey);
    if (cached) {
      console.log(`[GSC] Cache HIT: ${cacheKey}`);
      return { data: cached.data, fromCache: true, updatedAt: cached.updatedAt };
    }
  }

  if (!isConfigured()) {
    console.log('[GSC] Google API chưa cấu hình, trả về data rỗng');
    return {
      data: { keywords: [], pages: [], totals: { impressions: 0, clicks: 0, ctr: 0, position: 0 } },
      fromCache: false,
      configured: false,
    };
  }

  console.log(`[GSC] Cache MISS: ${cacheKey}, calling Google API...`);
  try {
    // Gọi GSC cho keywords
    const kwRes = await queryGSC(startDate, endDate, 'query', 200);
    // Gọi GSC cho pages
    const pageRes = await queryGSC(startDate, endDate, 'page', 100);

    const parseRow = (r) => ({
      keys: r.keys || [],
      impressions: parseInt(r.impressions || 0),
      clicks: parseInt(r.clicks || 0),
      ctr: parseFloat((r.ctr || 0) * 100).toFixed(2),
      position: parseFloat((r.position || 0)).toFixed(1),
    });

    const keywords = (kwRes.rows || []).map(parseRow);
    const pages = (pageRes.rows || []).map(parseRow);

    const total = {
      impressions: keywords.reduce((s, r) => s + r.impressions, 0),
      clicks: keywords.reduce((s, r) => s + r.clicks, 0),
      ctr: keywords.length ? (keywords.reduce((s, r) => s + parseFloat(r.ctr), 0) / keywords.length).toFixed(2) : 0,
      position: keywords.length ? (keywords.reduce((s, r) => s + parseFloat(r.position), 0) / keywords.length).toFixed(1) : 0,
    };

    // Tính rising keywords (tăng trưởng — dùng dữ liệu 2 period)
    // Rising keywords cần so sánh 2 period — xử lý trong sync job
    const rising = keywords.filter(k => parseFloat(k.position) <= 10 && k.impressions > 10).slice(0, 10);

    const result = { keywords, pages, rising, totals: total };
    db.setCache(cacheKey, 'gsc', result, endDate, period);

    return { data: result, fromCache: false, configured: true };
  } catch (err) {
    console.error('[GSC] API Error:', err.message);
    return {
      data: { keywords: [], pages: [], rising: [], totals: { impressions: 0, clicks: 0, ctr: 0, position: 0 } },
      fromCache: false,
      configured: true,
      error: err.message,
    };
  }
}

// ── Sync All (for cronjob) ───────────────────────────────────────

/**
 * Đồng bộ toàn bộ dữ liệu GA4 + GSC cho ngày hôm qua
 * Gọi bởi cronjob hàng ngày lúc 1:00 AM
 */
async function syncAll() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  console.log(`[Sync] Bắt đầu đồng bộ dữ liệu cho ngày ${dateStr}...`);
  db.logSync('full', dateStr, 'running');

  let totalRows = 0;
  const errors = [];

  try {
    // 1. Sync GA4 — 30 ngày gần nhất
    const endDate = dateStr;
    const startDate30 = new Date();
    startDate30.setDate(startDate30.getDate() - 30);
    const startStr = startDate30.toISOString().split('T')[0];

    const ga4Result = await getGA4Data(startStr, endDate, 30, true);
    if (ga4Result.data?.rows) {
      totalRows += ga4Result.data.rows.length;
    }
    console.log(`[Sync] GA4 done: ${ga4Result.data?.rows?.length || 0} rows`);

    // 2. Sync GSC
    const gscResult = await getGSCData(startStr, endDate, 30, true);
    if (gscResult.data?.keywords) {
      totalRows += gscResult.data.keywords.length;
    }
    console.log(`[Sync] GSC done: ${gscResult.data?.keywords?.length || 0} keywords`);

    db.logSync('full', dateStr, 'success', '', totalRows);
    console.log(`[Sync] Hoàn thành! ${totalRows} rows synced.`);
    return { success: true, date: dateStr, rowsSynced: totalRows };
  } catch (err) {
    console.error('[Sync] Error:', err.message);
    db.logSync('full', dateStr, 'error', err.message, totalRows);
    return { success: false, date: dateStr, error: err.message };
  }
}

module.exports = {
  getGA4Data,
  getGSCData,
  syncAll,
  isConfigured,
  getAccessToken,
};
