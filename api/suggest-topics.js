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
    // Remove markdown code blocks
    cleaned = cleaned.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
    
    const braceIdx = cleaned.indexOf('{');
    if (braceIdx >= 0) cleaned = cleaned.slice(braceIdx);
    else throw new Error("No JSON object found in AI response");

    // Strip trailing comma before closing brace (Gemini sometimes adds it)
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    try {
        return JSON.parse(cleaned);
    } catch (parseErr) {
        try {
            return j5.parse(cleaned);
        } catch {}
        const match = cleaned.match(/{[\s\S]*}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {}
        }
        console.error('❌ extractJSON failed. Raw cleaned (first 500):', cleaned.substring(0, 500));
        console.error('❌ Last error:', parseErr.message);
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
        prompt = `Gợi ý ${count} chủ đề cho "${categoryName}" (2026). Phong cách: ${template.name} - ${template.tone}.${avoidStr}
Trả về JSON:{"suggestions":[{"topic":"...","reason":"...","score":9}]}`;
    } else {
        prompt = `Gợi ý ${count} chủ đề cho "${categoryName}" (2026).${avoidStr}
Trả về JSON:{"suggestions":[{"topic":"...","type":"...","reason":"...","score":9}]}`;
    }

    try {
        const rawContent = await callGemini(prompt, { temperature: 1.0, max_tokens: 4096, timeout: 90000 });
        if (!rawContent) throw new Error('Gemini returned empty response');
        console.log('📥 suggest-topics raw:', rawContent);
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
