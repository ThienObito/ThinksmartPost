/**
 * API Usage endpoint — trả về thống kê sử dụng API
 */
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getStats } = require('../utils/api-tracker');

const router = express.Router();

// GET /api/usage
router.get('/', authRequired, (req, res) => {
  try {
    const stats = getStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
