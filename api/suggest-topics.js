const axios = require('axios');

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

    const prompt = `Bạn là chuyên gia SEO nội dung chuyên ngành.

Hãy gợi ý 6 chủ đề bài viết tối ưu nhất cho chuyên mục "${categoryName}" năm 2026.

Yêu cầu:
- Chủ đề phải hot, có khả năng rank cao Google, mang tính thực tiễn cao
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
                temperature: 0.8,
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
