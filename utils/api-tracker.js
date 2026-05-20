/**
 * API Usage Tracker — đếm số lần gọi API (DeepSeek, Replicate, WordPress)
 * Lưu vào data/api-usage.json, tự động reset theo ngày
 */
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');
const USAGE_FILE = path.join(DATA_DIR, 'api-usage.json');

// ── Cost ước tính (USD) ─────────────────────────────────────────
const COST_PER_CALL = {
  deepseek: 0.002,    // ~$0.002/call DeepSeek Chat
  replicate: 0.004,   // ~$0.004/call Flux Schnell
  wp_publish: 0,      // WordPress REST API (free)
  chat: 0.001,         // Chat có prompt ngắn hơn
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
  } catch {
    return { deepseek: 0, replicate: 0, wp_publish: 0, chat: 0, history: {}, lastUpdated: null };
  }
}

function save(data) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Track một API call
 * @param {'deepseek'|'replicate'|'wp_publish'|'chat'} service
 */
function track(service) {
  const data = load();
  data[service] = (data[service] || 0) + 1;

  // Daily history
  const today = new Date().toISOString().slice(0, 10);
  if (!data.history) data.history = {};
  if (!data.history[today]) data.history[today] = {};
  data.history[today][service] = (data.history[today][service] || 0) + 1;

  data.lastUpdated = new Date().toISOString();
  save(data);
}

/**
 * Lấy thống kê usage
 */
function getStats() {
  const data = load();
  const today = new Date().toISOString().slice(0, 10);
  const todayData = data.history?.[today] || {};

  const totalCost = (
    (data.deepseek || 0) * COST_PER_CALL.deepseek +
    (data.replicate || 0) * COST_PER_CALL.replicate +
    (data.chat || 0) * COST_PER_CALL.chat
  );

  const todayCost = (
    (todayData.deepseek || 0) * COST_PER_CALL.deepseek +
    (todayData.replicate || 0) * COST_PER_CALL.replicate +
    (todayData.chat || 0) * COST_PER_CALL.chat
  );

  // Lấy 30 ngày gần nhất
  const days = Object.keys(data.history || {}).sort().slice(-30).map(date => ({
    date,
    ...data.history[date],
  }));

  return {
    total: {
      deepseek: data.deepseek || 0,
      replicate: data.replicate || 0,
      wp_publish: data.wp_publish || 0,
      chat: data.chat || 0,
    },
    today: {
      deepseek: todayData.deepseek || 0,
      replicate: todayData.replicate || 0,
      wp_publish: todayData.wp_publish || 0,
      chat: todayData.chat || 0,
    },
    cost: {
      total: totalCost,
      today: todayCost,
      perCall: COST_PER_CALL,
    },
    days,
    lastUpdated: data.lastUpdated,
  };
}

module.exports = { track, getStats };
