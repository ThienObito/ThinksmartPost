/**
 * Smart Analytics & Content Intelligence API
 * Provides: content performance, keyword tracking, gap analysis, ROI calculator
 * Uses real article data + generated mock metrics for demo purposes.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Helpers ─────────────────────────────────────────────────────

function loadArticles() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('queue') && f !== 'users.json' && f !== 'templates.json')
      .map(f => {
        try { return { file: f, ...JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')) }; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch { return []; }
}

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf-8')); }
  catch { return []; }
}

// ── Generate realistic mock metrics based on real article data ───
function generateMetrics(articles) {
  const baseSeed = articles.length || 1;

  // Each article gets simulated traffic based on title length, recency, published status
  return articles.map((article, idx) => {
    const seed = (idx + 1) * (article.title ? article.title.length : 50);
    const daysSinceCreated = article.createdAt
      ? Math.max(1, (Date.now() - new Date(article.createdAt).getTime()) / 86400000)
      : 30;

    // Published articles get more traffic
    const publishedMultiplier = article.published ? 3.0 : 0.5;
    const recencyBoost = Math.max(0.3, 1 - daysSinceCreated / 180);

    const views = Math.floor((seed % 500 + 50) * publishedMultiplier * recencyBoost);
    const uniqueVisitors = Math.floor(views * (0.4 + Math.random() * 0.3));
    const avgTimeOnPage = Math.floor(60 + (seed % 240) * publishedMultiplier * 0.5);
    const bounceRate = Math.floor(30 + (seed % 40) - publishedMultiplier * 8);

    return {
      title: article.title || 'Untitled',
      category: article.category_slug || 'general',
      published: article.published || false,
      createdAt: article.createdAt,
      hasImages: article.images && article.images.length > 0,
      wpId: article.wpId || null,
      metrics: {
        views: Math.max(0, views),
        uniqueVisitors: Math.max(0, uniqueVisitors),
        avgTimeOnPage: Math.max(30, avgTimeOnPage),
        bounceRate: Math.max(10, Math.min(95, bounceRate)),
        engagementScore: Math.floor((uniqueVisitors / Math.max(1, views)) * 100),
      },
    };
  });
}

// ── Generate daily traffic for chart (last N days) ──────────────
function generateTrafficHistory(days = 30, articlesCount = 10) {
  const history = [];
  const now = new Date();
  const base = Math.max(10, articlesCount * 3);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayStr = date.toISOString().split('T')[0];
    // Weekend dip + weekday spike pattern
    const dayOfWeek = date.getDay();
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1.2;
    const noise = 0.7 + Math.random() * 0.6;
    const growth = 1 + (days - i) * 0.008; // slight upward trend

    const dailyViews = Math.floor(base * weekendFactor * noise * growth);
    const dailyVisitors = Math.floor(dailyViews * (0.5 + Math.random() * 0.2));
    const dailyArticles = Math.floor(Math.random() * Math.min(3, Math.ceil(articlesCount / 10)) + 1);

    history.push({
      date: dayStr,
      views: dailyViews,
      visitors: dailyVisitors,
      articlesCreated: dailyArticles,
    });
  }
  return history;
}

// ── Mock keyword data ───────────────────────────────────────────
function generateKeywords(articles) {
  const keywordPool = [
    { keyword: 'in 3D công nghiệp', volume: 2400, difficulty: 45, trend: 'up' },
    { keyword: 'máy in 3D resin', volume: 1800, difficulty: 32, trend: 'up' },
    { keyword: 'FDM vs SLA', volume: 1200, difficulty: 28, trend: 'stable' },
    { keyword: 'phần mềm mô phỏng 3D', volume: 960, difficulty: 52, trend: 'up' },
    { keyword: 'vật liệu in 3D y tế', volume: 720, difficulty: 38, trend: 'up' },
    { keyword: 'in 3D kim loại', volume: 3200, difficulty: 68, trend: 'up' },
    { keyword: '3D printing automotive', volume: 1800, difficulty: 55, trend: 'stable' },
    { keyword: 'in 3D hàng không', volume: 480, difficulty: 62, trend: 'down' },
    { keyword: 'thiết kế 3D cho UAV', volume: 340, difficulty: 42, trend: 'up' },
    { keyword: 'in 3D giá rẻ', volume: 2800, difficulty: 22, trend: 'down' },
    { keyword: 'tạo mẫu nhanh', volume: 1500, difficulty: 35, trend: 'stable' },
    { keyword: 'sản xuất phụ gia', volume: 900, difficulty: 48, trend: 'up' },
  ];

  // Match keywords to existing article categories
  const articleCategories = [...new Set(articles.map(a => a.category_slug).filter(Boolean))];
  const catKeywords = articleCategories.map((cat, idx) => ({
    keyword: keywordPool[idx % keywordPool.length],
    category: cat,
    articlesCovered: articles.filter(a => a.category_slug === cat).length,
    competitorsHave: Math.floor(Math.random() * 5) + 1,
  }));

  return {
    tracked: keywordPool,
    rising: keywordPool.filter(k => k.trend === 'up').slice(0, 5),
    byCategory: catKeywords,
    totalKeywords: keywordPool.length,
    topRankingPages: keywordPool.slice(0, 4).map((k, i) => ({
      keyword: k.keyword,
      currentPosition: Math.floor(Math.random() * 15) + 3,
      bestPosition: 2 + Math.floor(Math.random() * 3),
      volume: k.volume,
      url: `/${k.keyword.replace(/\s+/g, '-')}`,
    })),
  };
}

// ── Content Gap Analysis ────────────────────────────────────────
function generateGapAnalysis(articles) {
  const ourTopics = [...new Set(articles.map(a => a.title ? a.title.split(' ').slice(0, 3).join(' ') : '').filter(Boolean))];
  const gapPool = [
    { topic: 'Hướng dẫn cài đặt máy in 3D từ A-Z', volume: 1800, difficulty: 18, opportunity: 'Cao' },
    { topic: 'So sánh 10 phần mềm slice 3D phổ biến 2026', volume: 1200, difficulty: 22, opportunity: 'Cao' },
    { topic: 'In 3D bằng sợi carbon: Kỹ thuật và ứng dụng', volume: 2400, difficulty: 45, opportunity: 'Cao' },
    { topic: 'Chi phí vận hành máy in 3D: Phân tích toàn diện', volume: 900, difficulty: 28, opportunity: 'Trung bình' },
    { topic: 'Bảo trì và vệ sinh máy in 3D định kỳ', volume: 600, difficulty: 12, opportunity: 'Trung bình' },
    { topic: 'Tiêu chuẩn ISO cho in 3D công nghiệp', volume: 340, difficulty: 65, opportunity: 'Thấp' },
    { topic: 'Tối ưu hóa thông số in 3D: Nhiệt độ, tốc độ, layer height', volume: 2800, difficulty: 35, opportunity: 'Cao' },
    { topic: 'In 3D trong giáo dục: Chương trình giảng dạy', volume: 450, difficulty: 20, opportunity: 'Trung bình' },
    { topic: 'Xử lý hậu kỳ sản phẩm in 3D', volume: 1500, difficulty: 25, opportunity: 'Cao' },
    { topic: 'Thiết kế cho in 3D: Nguyên tắc vàng (DFAM)', volume: 2000, difficulty: 40, opportunity: 'Cao' },
  ];

  // Determine which topics we already cover (simulate)
  const covered = gapPool.filter(() => Math.random() > 0.6).map(g => g.topic);

  return {
    gaps: gapPool.filter(g => !covered.includes(g.topic)),
    covered: gapPool.filter(g => covered.includes(g.topic)),
    totalOpportunities: gapPool.filter(g => g.opportunity === 'Cao').length,
    estimatedTrafficGain: gapPool.reduce((sum, g) => sum + (g.opportunity === 'Cao' ? g.volume * 0.3 : g.volume * 0.1), 0),
    competitorDomains: ['3dprinter.vn', 'in3d.vn', 'tech3d.com.vn', '3dinnovation.vn'],
  };
}

// ── ROI Calculator Data ─────────────────────────────────────────
function generateROIData(articles) {
  const totalArticles = articles.length;
  const publishedArticles = articles.filter(a => a.published).length;
  const manualHoursPerArticle = 4; // hours to write manually
  const aiHoursPerArticle = 0.5;  // hours with tool
  const hoursSaved = totalArticles * (manualHoursPerArticle - aiHoursPerArticle);
  const hourlyRate = 150000; // VND/h — giá trị lao động content
  const moneySaved = hoursSaved * hourlyRate;
  const totalCost = totalArticles * 10000; // approximate API cost per article
  const contentValue = totalArticles * 200000; // value per article (SEO traffic)

  return {
    period: 'all-time',
    totalArticles,
    publishedArticles,
    manualTimePerArticle: manualHoursPerArticle,
    aiTimePerArticle: aiHoursPerArticle,
    totalTimeManual: totalArticles * manualHoursPerArticle,
    totalTimeAI: totalArticles * aiHoursPerArticle,
    hoursSaved,
    hourlyRate,
    moneySaved,
    totalCost,
    contentValue,
    roi: ((contentValue - totalCost) / Math.max(1, totalCost)) * 100,
    qualityScore: Math.min(95, 65 + publishedArticles * 2 + Math.floor(totalArticles * 0.5)),
    beforeAfter: {
      before: { timePerArticle: manualHoursPerArticle * 60, monthlyOutput: Math.floor(30 / manualHoursPerArticle) },
      after: { timePerArticle: aiHoursPerArticle * 60, monthlyOutput: Math.floor(30 / aiHoursPerArticle) },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ── GET /api/analytics/overview ─────────────────────────────────
router.get('/overview', authRequired, async (req, res) => {
  try {
    const articles = loadArticles();
    const days = parseInt(req.query.days) || 30;
    const userArticles = req.user.role === 'admin' ? articles : articles.filter(a => !a.userId || a.userId === req.user.id);

    const metrics = generateMetrics(userArticles);
    const trafficHistory = generateTrafficHistory(days, userArticles.length);

    const totalViews = metrics.reduce((sum, m) => sum + m.metrics.views, 0);
    const totalVisitors = metrics.reduce((sum, m) => sum + m.metrics.uniqueVisitors, 0);
    const avgBounce = metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + m.metrics.bounceRate, 0) / metrics.length) : 0;
    const avgEngagement = metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + m.metrics.engagementScore, 0) / metrics.length) : 0;

    res.json({
      success: true,
      overview: {
        totalViews,
        totalVisitors,
        avgBounceRate: avgBounce,
        avgEngagementScore: avgEngagement,
        totalArticles: userArticles.length,
        publishedArticles: userArticles.filter(a => a.published).length,
        totalViewsFormatted: totalViews.toLocaleString(),
        totalVisitorsFormatted: totalVisitors.toLocaleString(),
      },
      trafficHistory,
      topArticles: metrics
        .filter(m => m.published)
        .sort((a, b) => b.metrics.views - a.metrics.views)
        .slice(0, 5),
      allMetrics: metrics,
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/analytics/keywords ─────────────────────────────────
router.get('/keywords', authRequired, async (req, res) => {
  try {
    const articles = loadArticles();
    const keywords = generateKeywords(articles);
    res.json({ success: true, ...keywords });
  } catch (error) {
    console.error('Analytics keywords error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/analytics/gap-analysis ──────────────────────────────
router.get('/gap-analysis', authRequired, async (req, res) => {
  try {
    const articles = loadArticles();
    const gap = generateGapAnalysis(articles);
    res.json({ success: true, ...gap });
  } catch (error) {
    console.error('Analytics gap analysis error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/analytics/roi ──────────────────────────────────────
router.get('/roi', authRequired, async (req, res) => {
  try {
    const articles = loadArticles();
    const roi = generateROIData(articles);
    res.json({ success: true, ...roi });
  } catch (error) {
    console.error('Analytics ROI error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
