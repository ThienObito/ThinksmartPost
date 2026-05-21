const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Helper: extract + validate JSON ──────────────────────────────

function extractJSON(text) {
    if (!text) throw new Error("AI returned empty response");

    let cleaned = text
        .replace(/```(?:json)?\n?/gi, '')
        .replace(/```\s*$/gi, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch { /* fall through */ }
        }
        throw new Error("Cannot parse AI response as JSON");
    }
}

// ── Handler ──────────────────────────────────────────────────────

async function suggestTopicsHandler(req, res) {
    const { category = 'giai-phap' } = req.body;

    if (!process.env.DEEPSEEK_API_KEY) {
        return res.status(500).json({
            success: false,
            message: 'Thiếu DEEPSEEK_API_KEY trong file .env',
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

Hãy gợi ý 8 chủ đề bài viết ĐA DẠNG, KHÔNG TRÙNG LẶP cho chuyên mục "${categoryName}" năm 2026.${avoidStr}
QUAN TRỌNG - YÊU CẦU ĐA DẠNG HÓA:
- 8 chủ đề phải thuộc các GÓC NHÌN khác nhau: tổng quan, so sánh, hướng dẫn, case study, xu hướng, phân tích kỹ thuật, tối ưu chi phí, ứng dụng ngành
- KHÔNG trùng ý tưởng, không diễn giải cùng một nội dung dưới dạng khác
- Mỗi chủ đề phải HOÀN TOÀN KHÁC BIỆT về nội dung, cách tiếp cận và giá trị mang lại
- Các chủ đề phải hot, có khả năng rank cao Google, mang tính thực tiễn cao
- Phân tích loại bài viết tối ưu (Comparison, How-to, Case Study, List, Guide, Trend Report...)
- Đưa ra lý do tại sao chủ đề này có giá trị cho người đọc
- Chủ đề chuyên môn, khách quan, không liên quan đến quảng bá thương hiệu
- KHÔNG đề cập đến bất kỳ công ty, thương hiệu, website hay dịch vụ thương mại nào

Trả về đúng JSON (không thêm text nào khác):
{
  "suggestions": [
    {
      "topic": "Chủ đề bài viết đầy đủ",
      "type": "Comparison / How-to / Case Study / List / Guide / Trend",
      "reason": "Lý do tối ưu cho SEO và chuyển đổi",
      "score": 9
    }
  ]
}`;

    try {
        const aiRes = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 1.0,
                max_tokens: 4000,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const result = extractJSON(aiRes.data.choices[0].message.content);

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
            message: 'Lỗi khi gọi DeepSeek: ' + errMsg,
        });
    }
}

module.exports = suggestTopicsHandler;
