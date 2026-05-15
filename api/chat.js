/**
 * Chat API — Internal AI assistant for dashboard users.
 * Uses DeepSeek to answer user questions about the platform.
 */
const express = require('express');
const axios = require('axios');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// ── System prompt for the internal assistant ────────────────────
const SYSTEM_PROMPT = `Bạn là trợ lý AI tích hợp trong dashboard QTPosterPro — một công cụ tạo nội dung SEO và đăng bài WordPress tự động.

NHIỆM VỤ:
- Trả lời câu hỏi của người dùng về cách sử dụng dashboard
- Hỗ trợ viết nội dung ngắn, gợi ý tiêu đề, phân tích SEO
- Giải thích các tính năng: template, biến động {{variable}}, queue, AI Suggest, admin users
- LUÔN trả lời bằng tiếng Việt
- Trả lời ngắn gọn, thực tế, có thể đưa ra ví dụ cụ thể
- Nếu người dùng yêu cầu viết nội dung, hãy viết luôn
- Nếu không biết câu trả lời, hãy đề nghị người dùng hỏi admin

ĐỊNH DẠNG TRẢ LỜI: JSON
{ "reply": "Nội dung trả lời bằng tiếng Việt, có thể dùng markdown cơ bản" }`;

// ── POST /api/chat ─────────────────────────────────────────────
router.post('/', authRequired, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // Build messages array
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add optional context (e.g., recent articles, user info)
    if (context) {
      messages.push({ role: 'system', content: `User context: ${JSON.stringify(context)}` });
    }

    messages.push({ role: 'user', content: message });

    const aiRes = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        timeout: 30000,
      }
    );

    let text = aiRes.data.choices[0].message.content;
    // Try to extract JSON
    text = text.replace(/```(?:json)?\n?/gi, '').replace(/```\s*$/gi, '').trim();
    let reply;
    try {
      const parsed = JSON.parse(text);
      reply = parsed.reply || text;
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          reply = JSON.parse(match[0]).reply || text;
        } catch {
          reply = text;
        }
      } else {
        reply = text;
      }
    }

    // Maintain conversation history in the response for the frontend
    res.json({
      success: true,
      reply,
      usage: aiRes.data.usage,
    });
  } catch (error) {
    console.error('Chat API error:', error.message);
    const errMsg = error.response?.data?.error?.message || error.message;
    res.json({
      success: true,
      reply: `❌ Lỗi kết nối AI: ${errMsg}. Vui lòng thử lại sau.`,
    });
  }
});

module.exports = router;
