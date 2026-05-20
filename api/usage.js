/**
 * API Usage endpoint — trả về thống kê sử dụng API
 */
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getStats } = require('../utils/api-tracker');

const router = express.Router();

// GET /api/usage
router.get('/', authRequired, (req, res) => {
  const stats = getStats();
  res.json({ success: true, ...stats });
});

module.exports = router;
