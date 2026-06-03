const fs = require('fs');
const path = require('path');
const { callGemini } = require('../utils/ai-client');
const j5 = require('json5');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

// ── Helper: extract + validate JSON ──────────────────────────────

function extractJSON(text) {
    if (!text) throw new Error("AI returned empty response");

    let cleaned = text.trim();
    const braceIdx = cleaned.indexOf('{');
    if (braceIdx >= 0) cleaned = cleaned.slice(braceIdx);
    else throw new Error("No JSON object found in AI response");

    cleaned = cleaned.replace(/```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        try {
            return j5.parse(cleaned);
        } catch {}
        const match = cleaned.match(/{[\s\S]*}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch { /* fall through */ }
        }
        throw new Error("Cannot parse AI response as JSON");
    }
}

// ── Load existing titles to avoid duplicates ─────────────────────

function loadExistingTitles() {
    try {
        const files = fs.readdirSync(DATA_DIR)
            .filter(f => f.endsWith('.json') && !f.startsWith('queue') && f !== 'users.json' && f !== 'templates.json');
        return files.map(f => {
            try {
                const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
                return d.title || '';
            } catch { return ''; }
        }).filter(Boolean);
    } catch { return []; }
}

// ── Load template info ───────────────────────────────────────────

function loadTemplate(id) {
    try {
        const templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8'));
        return templates.find(t => t.id === id) || null;
    } catch { return null; }
}

// ── Handler ───────────────────────────────────────────────────────

async function suggestTopicsHandler(req, res) {
    const {
        category = 'giai-phap',
        count = 6,
        template_id = null,
        auto_fill = false,      // true = chỉ cần trả về N topic phù hợp, không cần chi tiết
    } = req.body;

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
            success: false,
            message: 'Thiếu GEMINI_API_KEY trong file .env',
        });
    }

    const template = template_id ? loadTemplate(template_id) : null;
    const categoryName =
        category === 'giai-phap'
            ? 'Giải pháp công nghệ & In 3D'
            : 'Ứng dụng thực tế & Case Study';

    const existingTitles = loadExistingTitles();
    const avoidStr = existingTitles.length > 0
        ? `\n⚠️ TUYỆT ĐỐI TRÁNH các chủ đề đã từng viết (không trùng lặp):\n${existingTitles.slice(-20).map(t => `- ${t}`).join('\n')}\n`
        : '';

    // Build prompt based on mode
    let prompt;
    if (auto_fill && template) {
        // Mode "Ngẫu nhiên Topic" — sinh N topic phù hợp với tính cách AI
        prompt = `Bạn là chuyên gia SEO nội dung chuyên ngành sản xuất và công nghệ.

Gợi ý ${count} chủ đề bài viết KHÔNG TRÙNG cho chuyên mục "${categoryName}" năm 2026.${avoidStr}
Các chủ đề này sẽ được viết theo phong cách tính cách AI sau:
- Tên: ${template.name}
- Giọng văn: ${template.tone}
- Trọng tâm SEO: ${template.seo_focus}

YÊU CẦU:
- ${count} chủ đề khác nhau, mỗi chủ đề 1 góc nhìn riêng
- Chủ đề hot, có khả năng SEO cao
- Mỗi chủ đề kèm lý do vì sao phù hợp với tính cách "${template.name}"
- KHÔNG quảng bá thương hiệu, không đề cập công ty

Trả về JSON thuần (không backtick, không text ngoài JSON):
{"suggestions":[{"topic":"...","reason":"...","score":9}]}`;
    } else {
        // Mode cũ — gợi ý chung
        prompt = `Bạn là chuyên gia SEO nội dung chuyên ngành sản xuất và công nghệ.

Gợi ý ${count} chủ đề bài viết KHÔNG TRÙNG cho chuyên mục "${categoryName}" năm 2026.${avoidStr}
YÊU CẦU:
- Mỗi chủ đề 1 góc nhìn khác nhau
- Chủ đề hot, có khả năng SEO cao
- Phân tích thể loại bài (Comparison/How-to/Case Study/Guide/Trend)
- Kèm lý do giá trị cho người đọc
- KHÔNG quảng bá thương hiệu, không đề cập công ty

Trả về JSON thuần (không backtick, không text ngoài JSON):
{"suggestions":[{"topic":"...","type":"...","reason":"...","score":9}]}`;
    }

    try {
        const rawContent = await callGemini(prompt, { temperature: 1.0, max_tokens: 4000, timeout: 60000 });
        if (!rawContent) throw new Error('Gemini returned empty response');
        console.log('📥 suggest-topics raw (first 300):', rawContent.substring(0, 300));
        const result = extractJSON(rawContent);

        res.json({
            success: true,
            suggestions: result.suggestions || [],
        });
    } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        console.error('❌ suggest-topics:', errMsg);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gọi Gemini: ' + errMsg,
        });
    }
}

module.exports = suggestTopicsHandler;
