/**
 * API Schedule Posts — Lên lịch đăng bài lên WordPress
 */
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const {
  getOptimalPublishTime,
  checkSpamRisk,
  fetchPublishedPosts,
  formatScheduleDisplay,
  CONFIG,
} = require('../utils/smart-scheduler');
const { wpAuth, asyncHandler } = require('../utils');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadArticle(filename) {
  try {
    // Primary: data/ directory (where actual articles are stored)
    let filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    // Fallback: data/articles/ (legacy sample articles)
    filePath = path.join(DATA_DIR, 'articles', filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

module.exports = function (app) {

  // ── POST /api/schedule-preview — Xem trước lịch đăng ─────────
  app.post('/api/schedule-preview', asyncHandler(async (req, res) => {
    const { articleFiles = [], mode = 'auto', manualTimes = [] } = req.body;

    if (!articleFiles.length) {
      return res.json({ success: true, schedule: [], warnings: [] });
    }

    // Lấy bài viết đã schedule từ WordPress
    const auth = wpAuth();
    const existingPosts = auth ? await fetchPublishedPosts(auth.url, 'admin', process.env.WP_APP_PASSWORD) : [];

    const existingSchedule = existingPosts
      .filter(p => p.status === 'future')
      .map(p => p.date);

    let schedule;
    if (mode === 'manual' && manualTimes.length > 0) {
      schedule = manualTimes;
    } else {
      schedule = getOptimalPublishTime(existingSchedule, articleFiles.length);
    }

    // Anti-spam check
    const spamCheck = checkSpamRisk(schedule);

    // Format hiển thị
    const display = schedule.map((dt, i) => ({
      file: articleFiles[i] || `Bài ${i + 1}`,
      datetime: dt,
      display: formatScheduleDisplay(dt),
    }));

    res.json({
      success: true,
      schedule: display,
      spam: spamCheck,
      warnings: spamCheck.warnings,
      safe: spamCheck.safe,
    });
  }));

  // ── POST /api/schedule-posts — Thực hiện lên lịch ─────────────
  app.post('/api/schedule-posts', asyncHandler(async (req, res) => {
    const { articleFiles = [], mode = 'auto', manualTimes = [], wpUrl, wpUser, wpPass } = req.body;

    const auth = wpAuth();
    const targetUrl = wpUrl || auth?.url;
    const targetUser = wpUser || 'admin';
    const targetPass = wpPass || process.env.WP_APP_PASSWORD;

    if (!targetUrl || !targetPass) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin WordPress' });
    }

    // Lấy bài viết đã schedule trên WP
    const existingPosts = await fetchPublishedPosts(targetUrl, targetUser, targetPass);
    const existingSchedule = existingPosts
      .filter(p => p.status === 'future')
      .map(p => p.date);

    // Tính lịch đăng
    let schedule;
    if (mode === 'manual' && manualTimes.length > 0) {
      schedule = manualTimes;
    } else {
      schedule = getOptimalPublishTime(existingSchedule, articleFiles.length);
    }

    // Anti-spam check
    const spamCheck = checkSpamRisk(schedule);
    if (!spamCheck.safe && !req.body.force) {
      return res.json({
        success: false,
        message: 'Cảnh báo Anti-spam',
        spam: spamCheck,
        canForce: true,
      });
    }

    // Thực hiện đăng bài lên WordPress với status=future
    const results = [];
    const authHeader = Buffer.from(`${targetUser}:${targetPass}`).toString('base64');

    for (let i = 0; i < articleFiles.length; i++) {
      const file = articleFiles[i];
      const article = loadArticle(file);
      const publishDate = schedule[i] || new Date(Date.now() + 3600000 * (i + 1)).toISOString();

      if (!article) {
        results.push({ file, success: false, error: 'Không tìm thấy file bài viết' });
        continue;
      }

      try {
        // Lấy category ID nếu có
        let categories = [];
        if (article.categories && article.categories.length > 0) {
          for (const catName of article.categories) {
            try {
              const { data: catData } = await axios.get(
                `${targetUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(catName)}`,
                { headers: { Authorization: `Basic ${authHeader}` }, timeout: 5000 }
              );
              if (catData && catData.length > 0) categories.push(catData[0].id);
            } catch { /* skip */ }
          }
        }

        const wpBody = {
          title: article.meta_title || article.title || '',
          content: article.content || '',
          status: 'future',
          date: publishDate,
          slug: article.slug || '',
          categories,
        };

        if (article.tags && article.tags.length) {
          wpBody.tags = article.tags;
        }

        const { data } = await axios.post(`${targetUrl}/wp-json/wp/v2/posts`, wpBody, {
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        });

        results.push({
          file,
          success: true,
          postId: data.id,
          postUrl: data.link,
          scheduledDate: publishDate,
        });
      } catch (err) {
        results.push({
          file,
          success: false,
          error: err.response?.data?.message || err.message,
        });
      }
    }

    res.json({
      success: results.some(r => r.success),
      results,
      summary: {
        total: results.length,
        ok: results.filter(r => r.success).length,
        fail: results.filter(r => !r.success).length,
      },
    });
  }));
};
