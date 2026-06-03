/**
 * API Routes — Multi-site Management
 */
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const {
  getAllSites,
  getSiteById,
  createSite,
  updateSite,
  deleteSite,
  testConnection,
  fetchCategories,
} = require('../db/sites');

// GET /api/sites — Danh sách tất cả sites
router.get('/', authRequired, (req, res) => {
  try {
    const sites = getAllSites();
    res.json({ success: true, sites });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/sites — Thêm site mới
router.post('/', authRequired, async (req, res) => {
  try {
    const { name, url, username, appPassword, categories } = req.body;
    if (!name || !url || !username || !appPassword) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin: name, url, username, appPassword' });
    }
    const site = createSite({ name, url, username, appPassword, categories });
    res.status(201).json({ success: true, site });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/sites/:id — Sửa site
router.put('/:id', authRequired, async (req, res) => {
  try {
    const site = updateSite(req.params.id, req.body);
    if (!site) return res.status(404).json({ success: false, message: 'Không tìm thấy site' });
    res.json({ success: true, site });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/sites/:id — Xóa site
router.delete('/:id', authRequired, (req, res) => {
  try {
    const ok = deleteSite(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy site' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/sites/:id/test — Test kết nối
router.post('/:id/test', authRequired, async (req, res) => {
  try {
    const result = await testConnection(req.params.id);
    res.json({ success: result.success, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/sites/:id/categories — Lấy categories từ WP site
router.get('/:id/categories', authRequired, async (req, res) => {
  try {
    const cats = await fetchCategories(req.params.id);
    res.json({ success: true, categories: cats });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
