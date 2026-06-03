/**
 * Smart Analytics API — Cache-First Backend
 * 
 * KIẾN TRÚC:
 * 1. Client gọi → Backend check DB Cache trước
 * 2. Cache HIT → Trả về ngay (không gọi Google API)
 * 3. Cache MISS → Gọi Google API → Lưu Cache → Trả về
 * 
 * Endpoints:
 *   GET /api/analytics/performance?period=30
 *   GET /api/analytics/keywords?period=30
 *   GET /api/analytics/gap?period=30
 *   GET /api/analytics/roi?period=30
 *   GET /api/analytics/sync-status
 *   POST /api/analytics/sync (admin only — force refresh)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { authRequired } = require('../middleware/auth');
const { wpAuth } = require('../utils');
const { getStats } = require('../utils/api-tracker');
const db = require('../db/database');
const googleApi = require('../utils/google-api');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Helpers ─────────────────────────────────────────────────────

function loadArticles() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('queue') && f !== 'users.json' && f !== 'templates.json' && f !== 'api-usage.json' && f !== 'library.json' && f !== 'notes.json' && f !== 'wp-config.json' && !f.startsWith('.'))
      .map(f => {
        try { return { file: f, ...JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')) }; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch { return []; }
}

async function fetchWpPosts() {
  try {
    const auth = wpAuth();
    if (!auth) return [];
    const res = await axios.get(`${auth.url}/wp-json/wp/v2/posts?per_page=100`, {
      headers: { Authorization: auth.header },
      timeout: 10000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch { return []; }
}

async function fetchWpCategories() {
  try {
    const auth = wpAuth();
    if (!auth) return [];
    const res = await axios.get(`${auth.url}/wp-json/wp/v2/categories?per_page=50`, {
      headers: { Authorization: auth.header },
      timeout: 10000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch { return []; }
}

/** Helper: parse period query → { startDate, endDate, period } */
function getPeriodRange(req) {
  const period = parseInt(req.query.period) || 30;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    period,
  };
}

// ═══════════════════════════════════════════════════════════════
//  1. GET /api/analytics/performance
//  Trả về: KPI cards, trafficChart, topArticles, articlesTable
// ═══════════════════════════════════════════════════════════════

router.get('/performance', authRequired, async (req, res) => {
  try {
    const { startDate, endDate, period } = getPeriodRange(req);
    const localArticles = loadArticles();
    const forceRefresh = req.query.refresh === 'true' && (req.user.role === 'admin' || req.user.role === 'dev');

    // ── 1. GA4 Data (cache-first) ──
    const ga4Result = await googleApi.getGA4Data(startDate, endDate, period, forceRefresh);
    const ga4 = ga4Result.data;

    // ── 2. Local article stats (luôn real-time) ──
    const userArticles = req.user.role === 'admin' || req.user.role === 'dev'
      ? localArticles
      : localArticles.filter(a => !a.userId || a.userId === req.user.id);

    // Timeline: bài tạo mới vs bài xuất bản theo ngày
    const timeline = [];
    const now = new Date();
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const created = userArticles.filter(a => a.createdAt?.startsWith(dayStr)).length;
      const published = userArticles.filter(a => a.publishedAt?.startsWith(dayStr)).length;
      // Merge với GA4 data nếu có
      const ga4Row = (ga4.rows || []).find(r => r.date === dayStr.replace(/-/g, ''));
      timeline.push({
        date: dayStr,
        articlesCreated: created,
        articlesPublished: published,
        views: ga4Row?.views || 0,
        visitors: ga4Row?.visitors || 0,
      });
    }

    // ── 3. Top articles (published, có WP link) ──
    const topArticles = userArticles
      .filter(a => a.published && a.wpId)
      .slice(0, 10)
      .map(a => ({
        title: a.title || 'Untitled',
        category: a.category_slug || 'general',
        publishedAt: a.publishedAt || a.createdAt,
        wpId: a.wpId,
        url: a.wpUrl || '',
        hasImages: !!(a.images?.length),
        // GA4 metrics per-article không lấy được từ GA4 API cơ bản
        // Cần dùng dimension pagePath — tạm thời tính từ aggregate
        metrics: { views: 0, visitors: 0, avgTime: 0, bounceRate: 0 },
      }));

    // ── 4. Articles Table — all articles with status ──
    const articlesTable = userArticles.map(a => ({
      title: a.title || 'Untitled',
      category: a.category_slug || 'general',
      createdAt: a.createdAt,
      status: a.published ? 'published' : 'draft',
      wpId: a.wpId || null,
      wpUrl: a.wpUrl || '',
      hasImages: !!(a.images?.length),
    }));

    res.json({
      success: true,
      period,
      startDate,
      endDate,
      cacheInfo: {
        fromCache: ga4Result.fromCache,
        configured: ga4Result.configured !== false,
        updatedAt: ga4Result.updatedAt || null,
      },
      kpis: {
        anTotalViews: ga4.total.views,
        anTotalVisitors: ga4.total.visitors,
        anEngagement: parseFloat((ga4.total.engagementRate * 100).toFixed(1)),
        anBounce: parseFloat(ga4.total.bounceRate.toFixed(1)),
      },
      trafficChart: timeline,
      topArticles,
      articlesTable,
      anArticlesCount: articlesTable.length,
    });
  } catch (error) {
    console.error('Analytics performance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  2. GET /api/analytics/keywords
//  Trả về: keywords table, rising, ranking pages (GSC cache-first)
// ═══════════════════════════════════════════════════════════════

router.get('/keywords', authRequired, async (req, res) => {
  try {
    const { startDate, endDate, period } = getPeriodRange(req);
    const forceRefresh = req.query.refresh === 'true' && (req.user.role === 'admin' || req.user.role === 'dev');

    // GSC data (cache-first)
    const gscResult = await googleApi.getGSCData(startDate, endDate, period, forceRefresh);
    const gsc = gscResult.data;

    // Trả về rỗng nếu chưa config Google
    if (!gscResult.configured) {
      return res.json({
        success: true,
        period, startDate, endDate,
        cacheInfo: { fromCache: false, configured: false },
        keywords: [],
        anKwCount: 0,
        rising: [],
        rankingPages: [],
      });
    }

    res.json({
      success: true,
      period, startDate, endDate,
      cacheInfo: {
        fromCache: gscResult.fromCache,
        configured: true,
        updatedAt: gscResult.updatedAt || null,
      },
      keywords: gsc.keywords || [],
      anKwCount: (gsc.keywords || []).length,
      rising: gsc.rising || [],
      rankingPages: (gsc.pages || []).slice(0, 20).map(p => ({
        url: p.keys[0] || '',
        impressions: p.impressions,
        clicks: p.clicks,
        ctr: p.ctr,
        position: p.position,
      })),
      totals: gsc.totals || { impressions: 0, clicks: 0, ctr: 0, position: 0 },
    });
  } catch (error) {
    console.error('Analytics keywords error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  3. GET /api/analytics/gap
//  Trả về: gaps, covered, competitor analysis
// ═══════════════════════════════════════════════════════════════

router.get('/gap', authRequired, async (req, res) => {
  try {
    const articles = loadArticles();
    const categories = await fetchWpCategories();

    // Lấy GSC data để biết keyword nào có volume cao
    const { startDate, endDate } = getPeriodRange(req);
    const gscResult = await googleApi.getGSCData(startDate, endDate, 30);
    const gscKeywords = (gscResult.data?.keywords || []).filter(k => k.impressions > 0);

    // Tìm keyword từ GSC mà chưa có article nào đề cập
    const articleTexts = articles.map(a => ((a.title || '') + ' ' + (a.summary || '')).toLowerCase());

    const gaps = [];
    for (const kw of gscKeywords) {
      const kwLower = (kw.keys[0] || '').toLowerCase();
      const isCovered = articleTexts.some(t => t.includes(kwLower));
      if (!isCovered && kw.impressions > 20) {
        gaps.push({
          keyword: kw.keys[0] || '',
          impressions: kw.impressions,
          clicks: kw.clicks,
          ctr: kw.ctr,
          position: kw.position,
          opportunity: kw.impressions > 100 ? 'Cao' : kw.impressions > 50 ? 'Trung bình' : 'Thấp',
          estimatedTraffic: Math.round(kw.impressions * 0.15 * (parseFloat(kw.ctr) / 100 || 0.03)),
        });
      }
    }

    // (chỉ trả gaps từ GSC, không fake từ categories)

    // Covered topics
    const covered = {};
    for (const a of articles) {
      const slug = a.category_slug || 'other';
      covered[slug] = (covered[slug] || 0) + 1;
    }
    const coveredList = Object.entries(covered).map(([slug, count]) => ({
      slug,
      name: categories.find(c => c.slug === slug)?.name || slug,
      count,
    }));

    // Competitor analysis (chỉ cần data thật)
    const competitorList = [
      { domain: 'thinksmart.vn', articles: articles.length, keywords: gscKeywords.length, score: 85 },
    ];

    const sortedGaps = gaps.sort((a, b) => b.estimatedTraffic - a.estimatedTraffic);
    const totalEstTraffic = sortedGaps.reduce((s, g) => s + (g.estimatedTraffic || 0), 0);

    res.json({
      success: true,
      gaps: sortedGaps.slice(0, 50),
      anGapCount: sortedGaps.length,
      anGapEstTraffic: totalEstTraffic,
      covered: coveredList,
      competitorList,
    });
  } catch (error) {
    console.error('Analytics gap error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  4. GET /api/analytics/roi
//  Trả về: hoursSaved, moneySaved, qualityScore, beforeAfter
// ═══════════════════════════════════════════════════════════════

router.get('/roi', authRequired, async (req, res) => {
  try {
    const articles = loadArticles();
    const totalArticles = articles.length;
    const publishedArticles = articles.filter(a => a.published).length;
    const usageStats = getStats();

    // ══ Tham số tính toán ══
    const manualHoursPerArticle = 4;    // giờ viết 1 bài thủ công
    const aiHoursPerArticle = 0.5;      // giờ viết 1 bài bằng AI
    const hourlyRateVND = 150000;       // lương/giờ (VND)
    const contentValuePerArticle = 200000; // giá trị mỗi bài (VND)

    // ══ Hours Saved ══
    const hoursSaved = totalArticles * (manualHoursPerArticle - aiHoursPerArticle);

    // ══ Money Saved ══
    const moneySaved = hoursSaved * hourlyRateVND;

    // ══ AI Cost (USD → VND) ══
    const totalCostUSD = (
      (usageStats.total.gemini || 0) * 0.002 +
      (usageStats.total.replicate || 0) * 0.004 +
      (usageStats.total.chat || 0) * 0.001
    );
    const totalCostVND = Math.round(totalCostUSD * 25500);

    // ══ Content Value ══
    const contentValue = totalArticles * contentValuePerArticle;

    // ══ ROI % ══
    const netProfit = contentValue - totalCostVND;
    const roi = totalCostVND > 0 ? Math.round((netProfit / totalCostVND) * 100) : 0;

    // ══ Quality Score (dựa trên readability/SEO heuristic) ══
    // Tính từ nội dung bài viết thật
    let totalScore = 0;
    let scoredArticles = 0;
    for (const a of articles) {
      const body = (a.content || a.summary || '').toLowerCase();
      if (body.length < 50) continue;
      let score = 65; // base

      // Tiêu chí: độ dài nội dung
      const wordCount = body.split(/\s+/).length;
      if (wordCount >= 800) score += 10;
      else if (wordCount >= 500) score += 5;

      // Tiêu chí: có heading
      if (body.includes('<h2') || body.includes('<h3') || body.includes('## ')) score += 8;

      // Tiêu chí: có hình ảnh
      if (a.images?.length > 0) score += 7;

      // Tiêu chí: có link
      if (body.includes('<a ') || body.includes('[link') || body.includes('href=')) score += 5;

      // Tiêu chí: có bullet list
      if (body.includes('<li>') || body.includes('- ') || body.includes('* ')) score += 5;

      // Giới hạn tối đa
      score = Math.min(score, 100);

      totalScore += score;
      scoredArticles++;
    }

    const qualityScore = scoredArticles > 0 ? Math.round(totalScore / scoredArticles) : 70;

    // ══ Before/After Comparison ══
    const beforeAfter = {
      before: {
        timePerArticle: manualHoursPerArticle * 60,   // phút
        monthlyOutput: Math.floor(30 / manualHoursPerArticle),  // bài/tháng
        monthlyCost: Math.round(manualHoursPerArticle * hourlyRateVND * 30),
      },
      after: {
        timePerArticle: aiHoursPerArticle * 60,
        monthlyOutput: Math.floor(30 / aiHoursPerArticle),
        monthlyCost: Math.round(aiHoursPerArticle * hourlyRateVND * 30 + totalCostVND),
      },
    };

    res.json({
      success: true,
      kpis: {
        anHoursSaved: Math.round(hoursSaved),
        anMoneySaved: Math.round(moneySaved),
        anQualityScore: qualityScore,
        anQualityNum: `${qualityScore}/100`,
        anQualityBar: qualityScore,
      },
      totalArticles,
      publishedArticles,
      totalCost: totalCostVND,
      contentValue,
      roi,
      beforeAfter,
    });
  } catch (error) {
    console.error('Analytics ROI error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  5. GET /api/analytics/sync-status
//  Trả về trạng thái đồng bộ gần nhất
// ═══════════════════════════════════════════════════════════════

router.get('/sync-status', authRequired, async (req, res) => {
  try {
    const ga4Status = db.getLastSyncStatus('ga4');
    const gscStatus = db.getLastSyncStatus('gsc');
    const fullStatus = db.getLastSyncStatus('full');

    const googleConfigured = googleApi.isConfigured();

    res.json({
      success: true,
      googleConfigured,
      lastSync: fullStatus || ga4Status || gscStatus,
      ga4: ga4Status || { status: 'never' },
      gsc: gscStatus || { status: 'never' },
      syncHistory: [],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  6. POST /api/analytics/sync (admin only)
//  Force refresh dữ liệu Google API
// ═══════════════════════════════════════════════════════════════

router.post('/sync', authRequired, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'dev') {
    return res.status(403).json({ success: false, message: 'Chỉ admin/dev mới được force sync' });
  }
  try {
    const result = await googleApi.syncAll();
    res.json({
      success: result.success,
      message: result.success ? `Đồng bộ hoàn tất: ${result.rowsSynced} rows` : `Lỗi: ${result.error}`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
