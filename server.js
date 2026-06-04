require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

// ── Shared utils ─────────────────────────────────────────────────
const {
  sanitizeContent,
  sanitizeImageUrl,
  validateFilename,
  asyncHandler,
  wpAuth,
  getCategoryId,
  refreshCategoryCache,
} = require('./utils');
const { track } = require('./utils/api-tracker');

// ── Database Init ────────────────────────────────────────────────
const db = require('./db/database');
db.initDatabase();

// ── Routes ──────────────────────────────────────────────────────
const createArticleHandler = require('./api/create-article');
const suggestTopicsHandler = require('./api/suggest-topics');
const authRoutes = require('./api/auth');
const queueRoutes = require('./api/queue');
const templateRoutes = require('./api/templates');
const chatRoutes = require('./api/chat');
const reportRoutes = require('./api/report');
const analyticsRoutes = require('./api/analytics');
const notesRoutes = require('./api/notes');
const libraryRoutes = require('./api/library');
const imageGenRoutes = require('./api/generate-image');

// ── Admin routes ────────────────────────────────────────────────
const adminRoutes = require('./api/admin');
const { authRequired, authOptional } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4002;
const DATA_DIR = path.join(__dirname, 'data');

// ── Rate Limiting ───────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200, // limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút' },
});

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login/register attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 15 phút' },
});

// AI endpoint limiter
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10, // 10 AI calls per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu AI, vui lòng chậm lại' },
});

// ── CORS ───────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:4001',
  'http://localhost:4002',
  'https://sotviet.site',
  'https://iflow.thinksmart.site',
  'https://thinksmart.vn',
  'https://app.thinkedu.com.vn',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(null, true); // Still allow, just log once per unknown origin
      console.warn('⚠️ CORS request from unknown origin:', origin);
    }
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use(limiter); // Global rate limit

// ── Data directory ──────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── WordPress helpers (uses shared utils) ───────────────────────
async function wpRequest(method, endpoint, data = null) {
  const auth = wpAuth();
  if (!auth) throw new Error('Thiếu WP_APP_PASSWORD trong .env');
  const config = {
    method,
    url: `${auth.url}/wp-json/wp/v2/${endpoint}`,
    headers: { Authorization: auth.header, 'Content-Type': 'application/json' },
    timeout: 30000,
  };
  if (data) config.data = data;
  const res = await axios(config);
  return res.data;
}

// ── Serve index ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Auth routes (with stricter rate limit) ──────────────────────
app.use('/api/auth', authLimiter, authRoutes);

// ── API routes ──────────────────────────────────────────────────
app.use('/api/queue', queueRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/generate-image', imageGenRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ── Multi-site routes ────────────────────────────────────────────
app.use('/api/sites', authRequired, require('./api/sites'));

// ── WP Settings API (save/load from config file) ────────────────
const WP_CONFIG_PATH = path.join(__dirname, 'data', 'wp-config.json');

app.get('/api/settings/wp', authRequired, (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync(WP_CONFIG_PATH, 'utf-8'));
    res.json({ success: true, wpUrl: cfg.wpUrl || '', wpPass: cfg.wpPass ? '••••••' : '' });
  } catch {
    res.json({ success: true, wpUrl: process.env.WP_URL || 'https://thinksmart.vn', wpPass: '' });
  }
});

app.post('/api/settings/wp', authRequired, (req, res) => {
  try {
    const { wpUrl, wpPass } = req.body;
    if (!wpUrl || !wpPass) {
      return res.status(400).json({ success: false, message: 'Thiếu WP URL hoặc Password' });
    }
    fs.writeFileSync(WP_CONFIG_PATH, JSON.stringify({ wpUrl, wpPass }, null, 2), 'utf-8');
    console.log(`⚙️ WP config updated: ${wpUrl}`);
    res.json({ success: true, message: 'Đã lưu cấu hình WordPress!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Chat (with AI rate limit) ───────────────────────────────────
app.use('/api/chat', aiLimiter, chatRoutes);

// ── Local articles CRUD (auth required) ─────────────────────────

app.get('/api/articles', authRequired, (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('queue') && f !== 'users.json' && f !== 'templates.json' && f !== 'api-usage.json' && f !== 'library.json' && f !== 'notes.json' && f !== 'wp-config.json' && !f.startsWith('.'))
      .map(file => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
          return { file, ...data };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const filtered = req.user.role === 'admin'
      ? files
      : files.filter(f => !f.userId || f.userId === req.user.id);

    res.json(filtered);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/articles/:filename', authRequired, asyncHandler(async (req, res) => {
  const resolvedPath = validateFilename(req.params.filename);
  if (!resolvedPath) {
    return res.status(404).json({ success: false, message: 'File không tồn tại' });
  }
  res.json(JSON.parse(fs.readFileSync(resolvedPath, 'utf-8')));
}));

app.put('/api/articles/:filename', authRequired, asyncHandler(async (req, res) => {
  const resolvedPath = validateFilename(req.params.filename);
  if (!resolvedPath) {
    return res.status(404).json({ success: false, message: 'File không tồn tại' });
  }
  const current = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  const { content, images, thumbnail, title, summary } = req.body;
  if (content !== undefined) current.content = content;
  if (images !== undefined) current.images = images;
  if (thumbnail !== undefined) current.thumbnail = thumbnail;
  if (title !== undefined) current.title = title;
  if (summary !== undefined) current.summary = summary;
  current.updatedAt = new Date().toISOString();
  fs.writeFileSync(resolvedPath, JSON.stringify(current, null, 2), 'utf-8');
  res.json({ success: true, message: 'Updated', article: current });
}));

app.delete('/api/articles/:filename', authRequired, asyncHandler(async (req, res) => {
  const resolvedPath = validateFilename(req.params.filename);
  if (!resolvedPath) {
    return res.status(404).json({ success: false, message: 'File không tồn tại' });
  }
  fs.unlinkSync(resolvedPath);
  res.json({ success: true });
}));

// ── Stats / Dashboard ───────────────────────────────────────────
app.get('/api/stats', authRequired, (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('queue') && f !== 'users.json' && f !== 'templates.json' && f !== 'api-usage.json' && f !== 'library.json' && f !== 'notes.json' && f !== 'wp-config.json' && !f.startsWith('.'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
        } catch { return null; }
      })
      .filter(Boolean);

    const filtered = req.user.role === 'admin'
      ? files
      : files.filter(f => !f.userId || f.userId === req.user.id);

    const totalArticles = filtered.length;
    const published = filtered.filter(f => f.published).length;
    const withImages = filtered.filter(f => f.images && f.images.length > 0).length;
    const categories = {};
    filtered.forEach(f => {
      const cat = f.category_slug || 'other';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    res.json({
      success: true,
      stats: { totalArticles, published, withImages, draft: totalArticles - published, categories },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── WordPress Categories endpoint ───────────────────────────────
app.get('/api/categories', authRequired, asyncHandler(async (req, res) => {
  const { categoryCache } = require('./utils');
  await refreshCategoryCache(); // refresh before sending
  const cats = Object.entries(categoryCache).map(([slug, id]) => ({ slug, id }));
  res.json({ success: true, categories: cats });
}));

// ── Post to WordPress ───────────────────────────────────────────
app.post('/api/post-all', authRequired, asyncHandler(async (req, res) => {
  const { files, deleteAfterPublish = false } = req.body;
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách files trống' });
  }

  const results = [];
  let successCount = 0;

  for (const rawFilename of files) {
    const resolvedPath = validateFilename(rawFilename);
    if (!resolvedPath) {
      results.push({ success: false, filename: rawFilename, error: 'File không tồn tại' });
      continue;
    }

    try {
      const post = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));

      // Sanitize content (handle double-encoded JSON)
      const cleanContent = sanitizeContent(post.content);

      // Strip <article> wrapper — WP Gutenberg wraps its own blocks
      let wpContent = cleanContent;
      const articleStart = wpContent.indexOf('<article');
      const articleEnd = wpContent.indexOf('</article>');
      if (articleStart >= 0 && articleEnd > articleStart) {
        const inner = wpContent.substring(articleStart, articleEnd + 10);
        // Get everything inside <article>...</article>
        const startTagEnd = wpContent.indexOf('>', articleStart) + 1;
        const innerContent = wpContent.substring(startTagEnd, articleEnd).trim();
        wpContent = wpContent.replace(inner, innerContent);
      }

      // Sanitize thumbnail
      const cleanThumb = sanitizeImageUrl(
        post.thumbnail || (Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : '')
      );

      // Build WP post body with dynamic category mapping
      const wpBody = {
        title: post.title || 'Untitled',
        content: wpContent,
        excerpt: post.summary || '',
        status: 'publish',
        categories: [getCategoryId(post.category_slug)],
      };

      if (cleanThumb) {
        console.log(`  ℹ️ Bài viết có ảnh (${cleanThumb.substring(0, 50)}...) nhưng bỏ qua featured_media — cần upload ảnh lên WP media library trước.`);
      }

      track('wp_publish');
      const data = await wpRequest('POST', 'posts', wpBody);

      // Mark as published & save back
      post.published = true;
      post.publishedAt = new Date().toISOString();
      post.wpId = data.id;
      post.content = cleanContent;
      post.thumbnail = cleanThumb;
      if (Array.isArray(post.images)) {
        post.images = post.images.map(sanitizeImageUrl).filter(Boolean);
      }
      fs.writeFileSync(resolvedPath, JSON.stringify(post, null, 2), 'utf-8');

      if (deleteAfterPublish) fs.unlinkSync(resolvedPath);

      successCount++;
      results.push({ success: true, title: post.title, wpId: data.id });
    } catch (error) {
      const details = error.response?.data;
      const errMsg = details?.message || error.message;
      if (details) {
        console.error('WP Error details:', JSON.stringify(details).substring(0, 500));
      }
      const friendlyMsg = errMsg.includes('featured_media')
        ? 'Ảnh đại diện không hợp lệ (featured_media phải là số ID media hợp lệ từ WordPress)'
        : errMsg;
      results.push({ success: false, filename: rawFilename, error: friendlyMsg });
    }
  }

  res.json({ success: true, successCount, results });
}));

// ── WordPress API proxy ─────────────────────────────────────────
app.get('/api/wp-categories', asyncHandler(async (req, res) => {
  try {
    const data = await wpRequest('GET', 'categories');
    res.json(data);
  } catch {
    res.json([
      { slug: 'giai-phap', name: 'Giải pháp' },
      { slug: 'ung-dung', name: 'Ứng dụng' },
    ]);
  }
}));

app.get('/api/wp-posts', asyncHandler(async (req, res) => {
  // Pass through WP query params (include, context, per_page, etc.)
  const qs = Object.entries(req.query)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const endpoint = qs ? `posts?${qs}` : 'posts?per_page=50';
  const data = await wpRequest('GET', endpoint);
  res.json(data);
}));

app.delete('/api/wp-posts/:id', asyncHandler(async (req, res) => {
  await wpRequest('DELETE', `posts/${req.params.id}?force=true`);
  res.json({ success: true });
}));

app.put('/api/wp-posts/:id', asyncHandler(async (req, res) => {
  const data = await wpRequest('POST', `posts/${req.params.id}`, req.body);
  res.json({ success: true, data });
}));

// ── AI Handlers (with auth + rate limit) ────────────────────────
app.post('/api/create-article', authRequired, aiLimiter, createArticleHandler);
app.post('/api/suggest-topics', authRequired, aiLimiter, suggestTopicsHandler);

// ── Smart Scheduling ────────────────────────────────────────────
require('./api/schedule-posts')(app);

// ── RAG API ─────────────────────────────────────────────────────
const ragService = require('./utils/rag');

// Index/Rebuild knowledge base (admin only)
app.post('/api/rag/index', require('./middleware/auth').authRequired, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'dev') {
    return res.status(403).json({ success: false, message: 'Chỉ admin/dev mới được rebuild index' });
  }
  try {
    const result = ragService.syncAll(true);
    res.json({ success: true, message: `RAG index: ${result.articlesIndexed} articles, ${result.templatesIndexed} templates`, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Search knowledge base
app.get('/api/rag/search', require('./middleware/auth').authRequired, (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q || !q.trim()) {
      return res.json({ success: true, results: [] });
    }
    const results = ragService.query(q, { limit: parseInt(limit) });
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Global error handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  console.error(err.stack?.substring(0, 500));
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Lỗi server nội bộ'
      : err.message,
  });
});

// ── SSE endpoint — real-time category updates ───────────────────
const { categoryEmitter, CATEGORY_EVENT } = require('./utils');
app.get('/api/events/categories', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 30000\n\n'); // reconnect after 30s if dropped

  const handler = (map) => {
    res.write(`event: ${CATEGORY_EVENT}\n`);
    res.write(`data: ${JSON.stringify(map)}\n\n`);
  };
  categoryEmitter.on(CATEGORY_EVENT, handler);
  req.on('close', () => categoryEmitter.off(CATEGORY_EVENT, handler));
});

// ── Multi-site migration ─────────────────────────────────────────
const { migrateFromEnv } = require('./db/sites');
migrateFromEnv();

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AutoContentPoster Pro v3.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Auth: enabled (JWT)`);
  console.log(`   Rate limit: global=200/15m, auth=20/15m, AI=10/1m`);

  // ── RAG Auto-Index trên startup ──────────────────────────────
  try {
    const ragSync = ragService.syncAll();
    console.log(`   RAG: ${ragSync.articlesIndexed} articles, ${ragSync.templatesIndexed} templates indexed`);
  } catch (e) {
    console.error(`   RAG index failed: ${e.message}`);
  }
});
