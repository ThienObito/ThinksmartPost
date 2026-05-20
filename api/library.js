/**
 * Media Library API — Image CRUD with folder organization + AI query.
 *
 * Folders:   { id, name, description, userId, createdAt, updatedAt }
 * Images:    { id, folderId, filename, originalName, url, thumb, alt,
 *              width, height, fileSize, mimeType, userId, createdAt }
 *
 * Storage:   /public/uploads/  (files)
 *            data/library.json (metadata)
 *
 * AI Query:  POST /api/library/ai-query — find images by semantic description
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const sharp = require('sharp');
const axios = require('axios');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// ── Paths ──────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs');
const DATA_FILE = path.join(DATA_DIR, 'library.json');

// Ensure directories exist
[UPLOAD_DIR, THUMB_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Multer config ──────────────────────────────────────────────────

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uuidv4().slice(0, 6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Loại file không hỗ trợ: ${file.mimetype}. Chỉ chấp nhận: JPEG, PNG, WebP, GIF, SVG`));
    }
  },
});

// ── Data helpers ───────────────────────────────────────────────────

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { folders: [], images: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getImageUrl(filename) {
  return `/uploads/${filename}`;
}

function getThumbUrl(filename) {
  const thumbFilename = `thumb_${filename}`;
  const thumbPath = path.join(THUMB_DIR, thumbFilename);
  if (fs.existsSync(thumbPath)) return `/uploads/thumbs/${thumbFilename}`;
  return `/uploads/${filename}`; // fallback
}

// ── Generate thumbnail with sharp ──────────────────────────────────

async function generateThumbnail(filename) {
  const srcPath = path.join(UPLOAD_DIR, filename);
  const thumbFilename = `thumb_${filename}`;
  const destPath = path.join(THUMB_DIR, thumbFilename);

  if (!fs.existsSync(srcPath)) return false;

  try {
    await sharp(srcPath)
      .resize(300, 200, { fit: 'cover', position: 'centre' })
      .webp({ quality: 70 })
      .toFile(destPath);
    return true;
  } catch {
    return false; // thumbnail generation best-effort
  }
}

// ═══════════════════════════════════════════════════════════════════
// FOLDER ROUTES
// ═══════════════════════════════════════════════════════════════════

// ── GET /api/library/folders ──────────────────────────────────────
router.get('/folders', authRequired, (req, res) => {
  try {
    const data = loadData();
    let folders = data.folders || [];

    // Non-admin users only see their own folders
    if (req.user.role !== 'admin') {
      folders = folders.filter((f) => f.userId === req.user.id);
    }

    // Attach image count
    const images = data.images || [];
    folders = folders.map((f) => ({
      ...f,
      imageCount: images.filter((img) => img.folderId === f.id).length,
    }));

    // Include uncategorized count
    const uncategorized = images.filter(
      (img) => !img.folderId || img.folderId === 'none'
    ).length;

    res.json({ success: true, folders, uncategorized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/library/folders ─────────────────────────────────────
router.post('/folders', authRequired, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên thư mục không được để trống' });
    }

    const data = loadData();
    const folder = {
      id: `folder-${uuidv4().slice(0, 8)}`,
      name: name.trim(),
      description: (description || '').trim(),
      userId: req.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    data.folders.push(folder);
    saveData(data);
    res.status(201).json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── PUT /api/library/folders/:id ──────────────────────────────────
router.put('/folders/:id', authRequired, (req, res) => {
  try {
    const data = loadData();
    const idx = data.folders.findIndex((f) => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Thư mục không tồn tại' });

    if (req.user.role !== 'admin' && data.folders[idx].userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const { name, description } = req.body;
    if (name !== undefined) data.folders[idx].name = name.trim();
    if (description !== undefined) data.folders[idx].description = description.trim();
    data.folders[idx].updatedAt = new Date().toISOString();

    saveData(data);
    res.json({ success: true, folder: data.folders[idx] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── DELETE /api/library/folders/:id ────────────────────────────────
router.delete('/folders/:id', authRequired, (req, res) => {
  try {
    const data = loadData();
    const folderIdx = data.folders.findIndex((f) => f.id === req.params.id);
    if (folderIdx === -1) return res.status(404).json({ success: false, message: 'Thư mục không tồn tại' });

    if (req.user.role !== 'admin' && data.folders[folderIdx].userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    // Move images from this folder to uncategorized
    const moved = (data.images || []).filter((img) => img.folderId === req.params.id);
    moved.forEach((img) => (img.folderId = ''));

    // Remove folder
    data.folders.splice(folderIdx, 1);
    saveData(data);
    res.json({ success: true, message: 'Đã xóa thư mục' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// IMAGE ROUTES
// ═══════════════════════════════════════════════════════════════════

// ── GET /api/library/images ───────────────────────────────────────
// Query: ?folderId=xxx&search=xxx&limit=50&offset=0
router.get('/images', authRequired, (req, res) => {
  try {
    const data = loadData();
    let images = data.images || [];
    const { folderId, search, limit = 50, offset = 0 } = req.query;

    // Filter by folder
    if (folderId && folderId !== 'all') {
      images = images.filter((img) => img.folderId === folderId || (!img.folderId && folderId === 'none'));
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      images = images.filter(
        (img) =>
          (img.alt || '').toLowerCase().includes(q) ||
          (img.originalName || '').toLowerCase().includes(q) ||
          (img.aiTags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    images.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const total = images.length;
    const page = images.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      images: page,
      total,
      offset: parseInt(offset),
      limit: parseInt(limit),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/library/images/upload ───────────────────────────────
router.post('/images/upload', authRequired, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    // Handle multer errors
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File quá lớn. Tối đa 10MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file ảnh' });
    }

    try {
      const { folderId, alt } = req.body;
      const file = req.file;

      // Generate thumbnail
      await generateThumbnail(file.filename);

      // Get image dimensions
      let width = 0;
      let height = 0;
      try {
        const metadata = await sharp(file.path).metadata();
        width = metadata.width || 0;
        height = metadata.height || 0;
      } catch {
        /* best-effort */
      }

      const imageEntry = {
        id: `img-${uuidv4().slice(0, 8)}-${Date.now()}`,
        folderId: folderId || '',
        filename: file.filename,
        originalName: file.originalname,
        url: getImageUrl(file.filename),
        thumb: getThumbUrl(file.filename),
        alt: (alt || file.originalname.replace(/\.[^.]+$/, '')).trim(),
        width,
        height,
        fileSize: file.size,
        mimeType: file.mimetype,
        aiTags: [],
        userId: req.user.id,
        createdAt: new Date().toISOString(),
      };

      const data = loadData();
      data.images.push(imageEntry);
      saveData(data);

      res.status(201).json({ success: true, image: imageEntry });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });
});

// ── POST /api/library/images/upload-url ───────────────────────────
// Upload image from URL (fetch + save locally)
router.post('/images/upload-url', authRequired, async (req, res) => {
  try {
    const { url, folderId, alt } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL không được để trống' });

    // Download the image
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    const buffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'image/png';
    const ext = path.extname(new URL(url).pathname).toLowerCase() || '.png';
    const filename = `${Date.now()}-${uuidv4().slice(0, 6)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    // Generate thumbnail
    await generateThumbnail(filename);

    // Get dimensions
    let width = 0;
    let height = 0;
    try {
      const metadata = await sharp(filePath).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;
    } catch {
      /* best-effort */
    }

    const imageEntry = {
      id: `img-${uuidv4().slice(0, 8)}-${Date.now()}`,
      folderId: folderId || '',
      filename,
      originalName: url.split('/').pop() || filename,
      url: getImageUrl(filename),
      thumb: getThumbUrl(filename),
      alt: (alt || 'Imported image').trim(),
      width,
      height,
      fileSize: buffer.length,
      mimeType: contentType,
      aiTags: [],
      userId: req.user.id,
      createdAt: new Date().toISOString(),
    };

    const data = loadData();
    data.images.push(imageEntry);
    saveData(data);

    res.status(201).json({ success: true, image: imageEntry });
  } catch (error) {
    const errMsg = error.code === 'ERR_INVALID_URL' ? 'URL không hợp lệ' : error.message;
    res.status(500).json({ success: false, message: errMsg });
  }
});

// ── PUT /api/library/images/:id ───────────────────────────────────
router.put('/images/:id', authRequired, (req, res) => {
  try {
    const data = loadData();
    const idx = data.images.findIndex((img) => img.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Ảnh không tồn tại' });

    if (req.user.role !== 'admin' && data.images[idx].userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const { alt, folderId, aiTags } = req.body;
    if (alt !== undefined) data.images[idx].alt = alt.trim();
    if (folderId !== undefined) data.images[idx].folderId = folderId;
    if (aiTags !== undefined) data.images[idx].aiTags = Array.isArray(aiTags) ? aiTags : [];

    saveData(data);
    res.json({ success: true, image: data.images[idx] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── DELETE /api/library/images/:id ────────────────────────────────
router.delete('/images/:id', authRequired, (req, res) => {
  try {
    const data = loadData();
    const idx = data.images.findIndex((img) => img.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Ảnh không tồn tại' });

    if (req.user.role !== 'admin' && data.images[idx].userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const img = data.images[idx];

    // Delete physical files
    const filePath = path.join(UPLOAD_DIR, img.filename);
    const thumbPath = path.join(THUMB_DIR, `thumb_${img.filename}`);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    try { if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath); } catch {}

    data.images.splice(idx, 1);
    saveData(data);
    res.json({ success: true, message: 'Đã xóa ảnh' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// AI QUERY — Search images by semantic description
// ═══════════════════════════════════════════════════════════════════

// ── POST /api/library/ai-query ────────────────────────────────────
// Body: { query: "mô tả nội dung ảnh cần tìm", limit: 10 }
// Returns: { success, images: [...], explanation: "..." }
router.post('/ai-query', authRequired, async (req, res) => {
  try {
    const { query, limit = 12 } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mô tả' });
    }

    const data = loadData();
    let images = data.images || [];

    // Filter by user permissions
    if (req.user.role !== 'admin') {
      images = images.filter((img) => img.userId === req.user.id);
    }

    if (images.length === 0) {
      return res.json({
        success: true,
        images: [],
        explanation: 'Thư viện ảnh trống. Hãy upload ảnh trước.',
      });
    }

    // Use DeepSeek to semantically match the query against image metadata
    const imageCatalog = images.map((img) => ({
      id: img.id,
      alt: img.alt,
      originalName: img.originalName,
      tags: img.aiTags || [],
      url: img.url,
      thumb: img.thumb,
      folderId: img.folderId,
    }));

    const prompt = `Bạn là AI quản lý thư viện ảnh. Người dùng đang tìm ảnh với mô tả: "${query}"

Dưới đây là danh sách ảnh trong thư viện (id, alt text, tags). Hãy chọn tối đa ${limit} ảnh phù hợp nhất với mô tả của người dùng.

QUY TẮC:
- Chọn ảnh dựa trên sự liên quan ngữ nghĩa giữa mô tả và (alt text + tags)
- Nếu không có ảnh phù hợp, trả về mảng rỗng
- Ưu tiên ảnh có nội dung rõ ràng

DANH SÁCH ẢNH:
${JSON.stringify(imageCatalog, null, 2)}

Trả về JSON:
{
  "selectedIds": ["id1", "id2"],
  "explanation": "Giải thích ngắn tại sao chọn những ảnh này (tiếng Việt)"
}`;

      track('deepseek');
      const aiRes = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    let raw = aiRes.data.choices[0].message.content;
    raw = raw.replace(/```(?:json)?\n?/gi, '').replace(/```\s*$/gi, '').trim();

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : { selectedIds: [], explanation: 'Không thể phân tích kết quả AI' };
    }

    const selectedIds = Array.isArray(result.selectedIds) ? result.selectedIds : [];
    const matchedImages = images
      .filter((img) => selectedIds.includes(img.id))
      .slice(0, parseInt(limit));

    // If no exact ID match, fallback to keyword matching
    if (matchedImages.length === 0) {
      const q = query.toLowerCase();
      const fallback = images.filter(
        (img) =>
          (img.alt || '').toLowerCase().includes(q) ||
          (img.originalName || '').toLowerCase().includes(q) ||
          (img.aiTags || []).some((t) => t.toLowerCase().includes(q))
      );
      return res.json({
        success: true,
        images: fallback.slice(0, parseInt(limit)),
        explanation: result.explanation || `Tìm thấy ${fallback.length} ảnh phù hợp với từ khóa`,
      });
    }

    res.json({
      success: true,
      images: matchedImages,
      explanation: result.explanation || `Tìm thấy ${matchedImages.length} ảnh phù hợp`,
    });
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('AI query error:', errMsg);

    // Fallback: text search
    try {
      const data = loadData();
      const q = req.body.query.toLowerCase();
      const fallback = (data.images || []).filter(
        (img) =>
          (img.alt || '').toLowerCase().includes(q) ||
          (img.aiTags || []).some((t) => t.toLowerCase().includes(q))
      );
      return res.json({
        success: true,
        images: fallback.slice(0, parseInt(req.body.limit || 12)),
        explanation: `AI không khả dụng, dùng tìm kiếm từ khóa: ${fallback.length} kết quả`,
      });
    } catch {
      res.status(500).json({ success: false, message: errMsg });
    }
  }
});

module.exports = router;
