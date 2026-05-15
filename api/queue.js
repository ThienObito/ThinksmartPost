/**
 * Publishing Queue — schedule articles for auto-publish
 * Now uses shared utils and has auto-process scheduler
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { sanitizeContent, validateFilename, wpAuth, getCategoryId } = require('../utils');

const QUEUE_FILE = path.join(__dirname, '..', 'data', 'queue.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

const router = express.Router();

// ── WP publish helper ───────────────────────────────────────────
async function wpPublish(title, content, summary, categorySlug) {
  const auth = wpAuth();
  if (!auth) throw new Error('Thiếu WP_APP_PASSWORD');

  const cleanContent = sanitizeContent(content);

  const res = await axios.post(
    `${auth.url}/wp-json/wp/v2/posts`,
    {
      title,
      content: cleanContent,
      excerpt: summary || '',
      status: 'publish',
      categories: [getCategoryId(categorySlug)],
    },
    {
      headers: { Authorization: auth.header, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );
  return res.data;
}

// ── Queue file helpers ──────────────────────────────────────────
function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
}

// ── Process a single queue item ─────────────────────────────────
async function processItem(item) {
  const decodedFilename = decodeURIComponent(item.filename);
  const resolvedPath = validateFilename(decodedFilename);
  if (!resolvedPath) {
    item.status = 'failed';
    item.error = 'File không tồn tại';
    item.processedAt = new Date().toISOString();
    return { id: item.id, status: 'failed', error: item.error };
  }

  const article = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  await wpPublish(article.title, article.content, article.summary, article.category_slug);

  // Mark the local article as published too
  article.published = true;
  article.publishedAt = new Date().toISOString();
  article.wpId = article.wpId || null;
  fs.writeFileSync(resolvedPath, JSON.stringify(article, null, 2), 'utf-8');

  item.status = 'published';
  item.publishedAt = new Date().toISOString();
  return { id: item.id, status: 'published' };
}

// ── Auto process: check every 2 minutes for scheduled/pending items ──
let processingLock = false;

async function autoProcessQueue() {
  if (processingLock) return; // prevent concurrent runs
  processingLock = true;

  try {
    const queue = loadQueue();
    // Process: pending items OR scheduled items whose time has come
    const now = Date.now();
    const ready = queue.filter(item => {
      if (item.status !== 'pending') return false;
      // If it has a scheduled time, check if it's due
      if (item.scheduledAt) {
        const scheduledTime = new Date(item.scheduledAt).getTime();
        return scheduledTime <= now;
      }
      return true; // no schedule = process immediately
    });

    if (ready.length === 0) {
      return;
    }

    console.log(`⏰ Auto-queue: processing ${ready.length} pending items...`);

    const results = [];
    for (const item of ready) {
      try {
        const result = await processItem(item);
        results.push(result);
        console.log(`  ✅ ${item.filename} → ${result.status}`);
      } catch (error) {
        item.status = 'failed';
        item.error = error.message;
        item.processedAt = new Date().toISOString();
        results.push({ id: item.id, status: 'failed', error: error.message });
        console.error(`  ❌ ${item.filename}: ${error.message}`);
      }
    }

    saveQueue(loadQueue()); // Save updated queue
    if (results.length > 0) {
      console.log(`⏰ Auto-queue: done (${results.filter(r => r.status === 'published').length}/${results.length} published)`);
    }
  } catch (error) {
    console.error('Auto-queue error:', error.message);
  } finally {
    processingLock = false;
  }
}

// Auto-process every 2 minutes
const AUTO_PROCESS_INTERVAL = 2 * 60 * 1000; // 2 min
setInterval(autoProcessQueue, AUTO_PROCESS_INTERVAL);
// Also run once on startup with a small delay
setTimeout(autoProcessQueue, 5000);

// ── Express routes ───────────────────────────────────────────────

// GET /api/queue
router.get('/', authRequired, (req, res) => {
  const queue = loadQueue();
  const userQueue = req.user.role === 'admin'
    ? queue
    : queue.filter(item => item.userId === req.user.id);
  res.json({ success: true, queue: userQueue });
});

// POST /api/queue — add article to queue
router.post('/', authRequired, (req, res) => {
  const { filename: rawFilename, scheduledAt } = req.body;
  if (!rawFilename) {
    return res.status(400).json({ success: false, message: 'Thiếu filename' });
  }

  // Validate filename exists before adding to queue
  const decodedFilename = decodeURIComponent(rawFilename);
  const resolvedPath = validateFilename(decodedFilename);
  if (!resolvedPath) {
    return res.status(404).json({ success: false, message: 'File không tồn tại' });
  }

  const queue = loadQueue();
  const entry = {
    id: `q-${Date.now()}`,
    filename: decodedFilename,
    userId: req.user.id,
    scheduledAt: scheduledAt || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  queue.push(entry);
  saveQueue(queue);

  res.status(201).json({ success: true, queue: entry });
});

// DELETE /api/queue/:id
router.delete('/:id', authRequired, (req, res) => {
  let queue = loadQueue();
  const item = queue.find(q => q.id === req.params.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy' });
  }
  if (req.user.role !== 'admin' && item.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Không có quyền' });
  }

  queue = queue.filter(q => q.id !== req.params.id);
  saveQueue(queue);
  res.json({ success: true });
});

// POST /api/queue/process — manual process trigger (admin only)
router.post('/process', authRequired, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Chỉ admin' });
  }

  const queue = loadQueue();
  // Process all pending items (not just scheduled ones)
  const pending = queue.filter(q => q.status === 'pending' && !q.scheduledAt);
  const results = [];

  for (const item of pending) {
    try {
      const result = await processItem(item);
      results.push(result);
    } catch (error) {
      item.status = 'failed';
      item.error = error.message;
      item.processedAt = new Date().toISOString();
      results.push({ id: item.id, status: 'failed', error: error.message });
    }
  }

  saveQueue(queue);
  res.json({ success: true, processed: results.length, results });
});

module.exports = router;
