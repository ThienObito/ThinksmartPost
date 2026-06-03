/**
 * Smart Scheduler — Phân tích traffic + tính thời điểm đăng tối ưu
 * Hỗ trợ WordPress REST API stats (Jetpack / WP Statistics) + heuristic Việt Nam
 */

const axios = require('axios');
const crypto = require('crypto');

// ── Cấu hình mặc định (từ .env hoặc heuristic Việt Nam) ─────────
const CONFIG = {
  timezone: process.env.SCHEDULE_TIMEZONE || 'Asia/Ho_Chi_Minh',
  maxPostsPerDay: parseInt(process.env.MAX_POSTS_PER_DAY) || 3,
  minHoursBetween: parseInt(process.env.MIN_HOURS_BETWEEN_POSTS) || 4,
  primeHours: (process.env.PRIME_HOURS || '7,8,9,12,13,20,21,22')
    .split(',').map(Number).filter(n => !isNaN(n)),
};

// ── 1. Lấy bài viết đã đăng từ WordPress ─────────────────────────

async function fetchPublishedPosts(wpUrl, wpUser, wpPass) {
  try {
    const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
    const { data } = await axios.get(`${wpUrl}/wp-json/wp/v2/posts`, {
      headers: { Authorization: `Basic ${auth}` },
      params: { per_page: 100, orderby: 'date', order: 'desc', _fields: 'id,title,date,status' },
      timeout: 10000,
    });
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('⚠️ fetchPublishedPosts failed:', e.message);
    return [];
  }
}

// ── 2. Lấy pageviews từ Jetpack / WP Statistics ──────────────────

async function fetchStats(wpUrl, wpUser, wpPass) {
  // Thử Jetpack stats trước
  try {
    const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
    const { data } = await axios.get(`${wpUrl}/wp-json/jetpack/v4/module/stats/data`, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 5000,
    });
    if (data && data.hours) return { source: 'jetpack', hours: data.hours };
  } catch { /* fall through */ }

  // Thử WP Statistics
  try {
    const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
    const { data } = await axios.get(`${wpUrl}/wp-json/wp-statistics/v2/hits`, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 5000,
    });
    if (data) return { source: 'wp-statistics', data };
  } catch { /* fall through */ }

  return null; // Không có stats
}

// ── 3. Heuristic mặc định cho thị trường Việt Nam ────────────────

function getDefaultHeuristic() {
  return {
    primeHours: CONFIG.primeHours, // [7,8,9,12,13,20,21,22]
    goodDays: [1, 3, 5], // Thứ 2 (1), Thứ 4 (3), Thứ 6 (5)
    badDays: [0, 6], // CN (0), Thứ 7 (6)
    weightByHour: {
      0: 2, 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 5, 7: 9, 8: 10,
      9: 9, 10: 7, 11: 7, 12: 9, 13: 8, 14: 6, 15: 6, 16: 5,
      17: 6, 18: 7, 19: 8, 20: 10, 21: 9, 22: 8, 23: 4,
    },
  };
}

// ── 4. Hàm kiểm tra Anti-spam ────────────────────────────────────

function checkSpamRisk(schedule) {
  const warnings = [];

  // Nhóm theo ngày
  const byDay = {};
  for (const s of schedule) {
    const d = new Date(s).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
  }

  // Cảnh báo > 3 bài/ngày
  for (const [day, count] of Object.entries(byDay)) {
    if (count > 3) warnings.push(`⚠️ Ngày ${day}: ${count} bài (>3 bài/ngày)`);
  }

  // Cảnh báo > 10 bài/tuần
  const total = schedule.length;
  if (total > 10) warnings.push(`⚠️ Tổng ${total} bài trong tuần (>10 bài/tuần)`);

  // Cảnh báo 2 bài cách nhau < 2 tiếng
  const sorted = [...schedule].sort((a, b) => new Date(a) - new Date(b));
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 3600000;
    if (diff < 2) {
      warnings.push(`⚠️ "${sorted[i-1].slice(11,16)}" → "${sorted[i].slice(11,16)}" chỉ cách ${diff.toFixed(1)}h (<2h)`);
    }
  }

  return { safe: warnings.length === 0, warnings };
}

// ── 5. Hàm chính: Tính thời điểm đăng tối ưu ─────────────────────

function getOptimalPublishTime(existingSchedule = [], numberOfPosts = 1) {
  const heuristic = getDefaultHeuristic();
  const results = [];
  const now = new Date();

  // Chuyển existingSchedule về Date objects
  const scheduled = existingSchedule
    .map(s => new Date(s))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a - b);

  // Tìm kiếm N slot tốt nhất
  let attempts = 0;
  const maxAttempts = 365; // Tránh loop vô hạn

  while (results.length < numberOfPosts && attempts < maxAttempts) {
    attempts++;

    // Chọn ngày bắt đầu tìm
    const baseDate = new Date(now);
    baseDate.setDate(baseDate.getDate() + Math.floor(attempts / 4));
    baseDate.setHours(0, 0, 0, 0);

    // Kiểm tra ngày tốt (ưu tiên Thứ 2,4,6)
    const dayOfWeek = baseDate.getDay(); // 0=CN, 1=T2
    const isGoodDay = heuristic.goodDays.includes(dayOfWeek);
    const isBadDay = heuristic.badDays.includes(dayOfWeek);

    // Nếu ngày xấu, skip
    if (isBadDay && numberOfPosts <= 5) continue;

    // Sắp xếp giờ theo weight (cao → thấp)
    const sortedHours = [...heuristic.primeHours].sort(
      (a, b) => heuristic.weightByHour[b] - heuristic.weightByHour[a]
    );

    let postsOnDay = 0;
    for (const hour of sortedHours) {
      if (postsOnDay >= CONFIG.maxPostsPerDay) break;
      if (results.length >= numberOfPosts) break;

      const candidate = new Date(baseDate);
      candidate.setHours(hour, 0, 0, 0);

      // Không chọn giờ trong quá khứ
      if (candidate <= now) continue;

      // Kiểm tra khoảng cách tối thiểu với các bài đã schedule
      const allScheduled = [...scheduled, ...results].map(d => new Date(d));
      let tooClose = false;
      for (const existing of allScheduled) {
        const diff = Math.abs((candidate - existing) / 3600000);
        if (diff < CONFIG.minHoursBetween) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      results.push(candidate.toISOString());
      postsOnDay++;
    }

    // Nếu gần cuối tuần mà chưa đủ, cho phép đăng thêm vào ngày xấu
    if (attempts > 30 && !isBadDay) continue;
  }

  // Sort kết quả theo thời gian
  return results.sort((a, b) => new Date(a) - new Date(b));
}

// ── 6. Format hiển thị thân thiện ─────────────────────────────────

function formatScheduleDisplay(datetimeStr, tz = CONFIG.timezone) {
  const d = new Date(datetimeStr);
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const day = days[d.getDay()];
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString('vi-VN');
  return `${day}, ${date} lúc ${time}`;
}

module.exports = {
  CONFIG,
  fetchPublishedPosts,
  fetchStats,
  checkSpamRisk,
  getOptimalPublishTime,
  formatScheduleDisplay,
  getDefaultHeuristic,
};
