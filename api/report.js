/**
 * Report API — Gathers data for Excel/PDF export.
 * Leader/Admin only.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');

function loadArticles() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('queue') && f !== 'users.json' && f !== 'templates.json')
      .map(f => {
        try { return { file: f, ...JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')) }; }
        catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf-8')); }
  catch { return []; }
}

// ── GET /api/report/summary ─────────────────────────────────────
router.get('/summary', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Chỉ leader mới xem được báo cáo' });
    }

    const { days = 30 } = req.query;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days));

    const allArticles = loadArticles();
    const users = loadUsers();
    const recentArticles = allArticles.filter(a => new Date(a.createdAt) >= cutoff);

    // ── Per-sale stats ──────────────────────────────────────
    const saleStats = {};
    users.forEach(u => {
      if (u.role === 'sale') {
        saleStats[u.username] = { username: u.username, fullName: u.fullName || u.username, total: 0, published: 0, draft: 0, withImages: 0 };
      }
    });

    // Count articles without userId as "unknown"
    saleStats['unknown'] = { username: 'Không xác định', fullName: 'Không xác định', total: 0, published: 0, draft: 0, withImages: 0 };

    recentArticles.forEach(a => {
      const uid = a.userId || 'unknown';
      if (!saleStats[uid]) {
        saleStats[uid] = { username: uid, fullName: uid, total: 0, published: 0, draft: 0, withImages: 0 };
      }
      saleStats[uid].total++;
      if (a.published) saleStats[uid].published++;
      else saleStats[uid].draft++;
      if (a.images && a.images.length > 0) saleStats[uid].withImages++;
    });

    // ── Top articles ────────────────────────────────────────
    const topArticles = [...recentArticles]
      .sort((a, b) => {
        const scoreA = (a.published ? 1 : 0) + (a.images && a.images.length > 0 ? 1 : 0);
        const scoreB = (b.published ? 1 : 0) + (b.images && b.images.length > 0 ? 1 : 0);
        return scoreB - scoreA;
      })
      .slice(0, 5);

    // ── Category breakdown ──────────────────────────────────
    const categoryStats = {};
    recentArticles.forEach(a => {
      const cat = a.category_slug || 'other';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });

    res.json({
      success: true,
      report: {
        period: { days: parseInt(days), from: cutoff.toISOString(), to: new Date().toISOString() },
        totalArticles: recentArticles.length,
        totalPublished: recentArticles.filter(a => a.published).length,
        totalDraft: recentArticles.filter(a => !a.published).length,
        withImages: recentArticles.filter(a => a.images && a.images.length > 0).length,
        usersCount: users.filter(u => u.role === 'sale').length,
        saleStats: Object.values(saleStats).filter(s => s.total > 0 || s.username === 'unknown').sort((a, b) => b.total - a.total),
        topArticles: topArticles.map(a => ({
          title: a.title || 'No title',
          category: a.category_slug || 'N/A',
          published: a.published ? 'Yes' : 'No',
          hasImages: a.images && a.images.length > 0 ? 'Yes' : 'No',
          createdAt: a.createdAt,
        })),
        categoryStats,
      },
    });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
