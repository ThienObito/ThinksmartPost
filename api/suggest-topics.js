const fs = require('fs');
const path = require('path');
const { callGemini } = require('../utils/ai-client');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Helper: extract + validate JSON ──────────────────────────────

function extractJSON(text) {
    if (!text) throw new Error("AI returned empty response");

    let cleaned = text.trim();
    // Find first { and strip everything before it
    const braceIdx = cleaned.indexOf('{');
    if (braceIdx >= 0) cleaned = cleaned.slice(braceIdx);
    else throw new Error("No JSON object found in AI response");

    // Remove backtick code block wrappers (if present after { extraction)
    cleaned = cleaned.replace(/```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/{[\s\S]*}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch { /* fall through */ }
        }
        throw new Error("Cannot parse AI response as JSON");
    }
}
async function suggestTopicsHandler(req, res) {
    const { category = 'giai-phap' } = req.body;

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
            success: false,
            message: 'Thiếu GEMINI_API_KEY trong file .env',
        });
    }

    const categoryName =
        category === 'giai-phap'
            ? 'Giải pháp công nghệ & In 3D'
            : 'Ứng dụng thực tế & Case Study';

    // Load existing article titles to avoid duplicates
    let existingTitles = [];
    try {
        const files = fs.readdirSync(DATA_DIR)
            .filter(f => f.endsWith('.json') && !f.startsWith('queue') && f !== 'users.json' && f !== 'templates.json');
        existingTitles = files.map(f => {
            try {
                const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
                return d.title || '';
            } catch { return ''; }
        }).filter(Boolean);
    } catch { /* ignore */ }

    const avoidStr = existingTitles.length > 0
        ? `\n⚠️ TUYỆT ĐỐI TRÁNH các chủ đề đã từng viết (không trùng lặp):\n${existingTitles.slice(-15).map(t => `- ${t}`).join('\n')}\n`
        : '';

    const prompt = `Bạn là chuyên gia SEO nội dung chuyên ngành sản xuất và công nghệ.

Gợi ý 6 chủ đề bài viết KHÔNG TRÙNG cho chuyên mục "${categoryName}" năm 2026.${avoidStr}
YÊU CẦU:
- Mỗi chủ đề 1 góc nhìn khác nhau
- Chủ đề hot, có khả năng SEO cao
- Phân tích thể loại bài (Comparison/How-to/Case Study/Guide/Trend)
- Kèm lý do giá trị cho người đọc
- KHÔNG quảng bá thương hiệu, không đề cập công ty

Trả về JSON thuần (không backtick, không text ngoài JSON):
{"suggestions":[{"topic":"...","type":"...","reason":"...","score":9}]}`;

    try {
        const rawContent = await callGemini(prompt, { temperature: 1.0, max_tokens: 4000, timeout: 60000 });
        if (!rawContent) throw new Error('Gemini returned empty response');
        console.log('📥 Gemini raw response (first 500):', rawContent.substring(0, 500));
        const result = extractJSON(rawContent);

        res.json({
            success: true,
            suggestions: result.suggestions || [],
        });
    } catch (error) {
        const errMsg =
            error.response?.data?.error?.message || error.message;
        console.error('❌ suggest-topics:', errMsg);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gọi Gemini: ' + errMsg,
        });
    }
}

module.exports = suggestTopicsHandler;
