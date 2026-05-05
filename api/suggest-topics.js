const axios = require('axios');

// Hàm extract JSON an toàn
function extractJSON(text) {
    if (!text) throw new Error("AI trả về rỗng");
    
    // Loại bỏ markdown code block
    text = text.replace(/```json\n?/gi, '').replace(/```\s*$/gi, '').trim();
    
    try {
        return JSON.parse(text);
    } catch (e) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {}
        }
        throw new Error("Không parse được JSON từ AI");
    }
}

async function suggestTopicsHandler(req, res) {
    const { category = 'giai-phap' } = req.body;
    const categoryName = category === 'giai-phap' ? 'Giải pháp công nghệ & In 3D' : 'Ứng dụng thực tế & Case Study';

    if (!process.env.DEEPSEEK_API_KEY) {
        return res.status(500).json({ 
            success: false, 
            message: "Thiếu DEEPSEEK_API_KEY trong file .env" 
        });
    }

    const prompt = `Bạn là chuyên gia SEO cho Thinksmart.vn (công ty in 3D công nghiệp, giải pháp sản xuất thông minh).

Hãy gợi ý 6 chủ đề bài viết tối ưu nhất cho chuyên mục "${categoryName}" năm 2026.

Yêu cầu:
- Chủ đề phải hot, có khả năng rank cao Google, mang tính thực tiễn cao
- Phân tích loại bài viết tối ưu (Comparison, How-to, Case Study, List, Guide, Trend Report...)
- Đưa ra lý do tại sao chủ đề này tốt cho Thinksmart.vn
- Ưu tiên chủ đề liên quan đến in 3D, sản xuất, y khoa, công nghiệp 4.0, xu hướng 2026

Trả về đúng định dạng JSON sau (không thêm text nào khác):
{
  "suggestions": [
    {
      "topic": "Chủ đề bài viết đầy đủ",
      "type": "Comparison / How-to / Case Study / List / Guide / Trend",
      "reason": "Lý do tại sao chủ đề này tối ưu cho SEO và chuyển đổi",
      "score": 9
    }
  ]
}`;

    try {
        const aiRes = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.8,
            max_tokens: 4000
        }, {
            headers: { 
                Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const result = extractJSON(aiRes.data.choices[0].message.content);
        
        res.json({ 
            success: true, 
            suggestions: result.suggestions || [] 
        });

    } catch (error) {
        console.error("Lỗi suggest-topics:", error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi khi gọi DeepSeek: " + (error.response?.data?.error?.message || error.message) 
        });
    }
}

module.exports = suggestTopicsHandler;