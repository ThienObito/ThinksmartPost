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
    const { name, url, username, appPassword, categories, defaultCategory } = req.body;
    if (!name || !url || !username || !appPassword) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin: name, url, username, appPassword' });
    }

    // 1. Kiểm tra kết nối WP thực tế trước khi lưu
    const axios = require('axios');
    const authHeader = Buffer.from(`${username.trim()}:${appPassword.trim()}`).toString('base64');
    const cleanUrl = url.replace(/\/+$/, '');
    
    try {
      await axios.get(`${cleanUrl}/wp-json/wp/v2/posts?per_page=1`, {
        headers: { Authorization: `Basic ${authHeader}` },
        timeout: 10000
      });
    } catch (wpError) {
      return res.status(400).json({ success: false, message: 'Lỗi WP: URL, Username hoặc App Password sai!' });
    }

    // 2. Kết nối thành công mới lưu
    const site = createSite({ name, url: cleanUrl, username, appPassword, categories, defaultCategory });
    res.status(201).json({ success: true, site });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/sites/:id — Sửa site
router.put('/:id', authRequired, async (req, res) => {
  try {
    const updates = req.body;
    
    // Nếu cập nhật mật khẩu hoặc URL, test thử trước khi cho phép lưu
    if (updates.appPassword || updates.url || updates.username) {
      // Vì là update, cần lấy thông tin cũ bù vào thông tin thiếu để test
      const { loadSites, decrypt } = require('../db/sites');
      const oldSite = loadSites().find(s => s.id === req.params.id);
      if (!oldSite) return res.status(404).json({ success: false, message: 'Không tìm thấy site' });

      const testUrl = updates.url ? updates.url.replace(/\/+$/, '') : oldSite.url;
      const testUser = updates.username ? updates.username.trim() : oldSite.username;
      const testPass = updates.appPassword ? updates.appPassword.trim() : decrypt(oldSite.appPassword);
      
      const axios = require('axios');
      const authHeader = Buffer.from(`${testUser}:${testPass}`).toString('base64');
      
      try {
        await axios.get(`${testUrl}/wp-json/wp/v2/posts?per_page=1`, {
          headers: { Authorization: `Basic ${authHeader}` },
          timeout: 10000
        });
      } catch (wpError) {
        return res.status(400).json({ success: false, message: 'Lỗi WP: URL, Username hoặc App Password sai!' });
      }
    }

    const site = updateSite(req.params.id, updates);
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
