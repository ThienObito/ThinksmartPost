#!/usr/bin/env node
/**
 * Daily Analytics Sync Cronjob
 * 
 * Chạy tự động lúc 1:00 AM mỗi ngày để cào dữ liệu GA4 & GSC
 * về lưu cache trong SQLite.
 * 
 * Cách dùng:
 *   node scripts/sync-analytics.js
 * 
 * Cài đặt cron (Linux):
 *   0 1 * * * cd /path/to/project && node scripts/sync-analytics.js >> logs/sync.log 2>&1
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Init DB
const db = require('../db/database');
db.initDatabase();

// Load Google API service
const googleApi = require('../utils/google-api');

async function main() {
  console.log(`[Sync Cron] ====== BẮT ĐẦU: ${new Date().toLocaleString('vi-VN')} ======`);

  if (!googleApi.isConfigured()) {
    console.log('[Sync Cron] ⚠️ Google API chưa được cấu hình.');
    console.log('[Sync Cron] Thêm các biến môi trường sau vào .env:');
    console.log(`
  GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
  GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n..."
  GA4_PROPERTY_ID=123456789
  GSC_SITE_URL=https://thinksmart.vn
    `);
    console.log('[Sync Cron] Bỏ qua đồng bộ, dùng dữ liệu local.');
    return;
  }

  try {
    const result = await googleApi.syncAll();
    if (result.success) {
      console.log(`[Sync Cron] ✅ Thành công: ${result.rowsSynced} rows cho ngày ${result.date}`);
    } else {
      console.error(`[Sync Cron] ❌ Thất bại: ${result.error}`);
    }
  } catch (err) {
    console.error('[Sync Cron] 💥 Lỗi không xác định:', err.message);
  }

  console.log(`[Sync Cron] ====== KẾT THÚC: ${new Date().toLocaleString('vi-VN')} ======`);
}

main().finally(() => {
  db.closeDatabase();
  process.exit(0);
});
