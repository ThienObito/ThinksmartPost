/**
 * Image Generation API — Uses Replicate Flux to generate article illustrations.
 */
const express = require('express');
const Replicate = require('replicate');
const { authRequired } = require('../middleware/auth');
const { track } = require('../utils/api-tracker');

const router = express.Router();
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// ── POST /api/generate-image/suggest ────────────────────────────
// AI suggests image prompts based on article title/content
router.post('/suggest', authRequired, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title required' });

    const prompt = `Bạn là chuyên gia AI image prompt. Dựa vào tiêu đề bài viết sau, hãy gợi ý 4 mô tả ảnh bằng tiếng Anh để minh họa cho bài viết.

TIÊU ĐỀ: "${title}"

YÊU CẦU:
- Mỗi prompt mô tả một ảnh khác nhau (tổng quan, chi tiết, infographic, kết luận)
- Dùng tiếng Anh, phù hợp với công nghệ/công nghiệp
- Thêm từ khóa: "professional, high quality, 4K, modern, clean background"
- Mỗi prompt tối đa 80 từ

TRẢ VỀ JSON:
{
  "prompts": [
    "Prompt 1...",
    "Prompt 2...",
    "Prompt 3...",
    "Prompt 4..."
  ]
}`;

    const aiRes = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      { model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.8, max_tokens: 2000 },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
    );

    let text = aiRes.data.choices[0].message.content;
    text = text.replace(/```(?:json)?\n?/gi, '').replace(/```\s*$/gi, '').trim();
    let result;
    try { result = JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : { prompts: [text.substring(0, 200)] };
    }

    res.json({ success: true, prompts: result.prompts || [] });
  } catch (error) {
    console.error('Suggest prompts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/generate-image/create ─────────────────────────────
// Generates 4 images from a prompt using Replicate Flux
router.post('/create', authRequired, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: 'Prompt required' });
    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(400).json({ success: false, message: 'REPLICATE_API_TOKEN chưa được cấu hình' });
    }

    const results = [];
    // Generate 4 images
    for (let i = 0; i < 4; i++) {
      try {
        track('replicate');
        const output = await replicate.run('black-forest-labs/flux-schnell', {
          input: {
            prompt: `${prompt} --ar 16:9`,
            go_fast: true,
            megapixels: '1',
            num_outputs: 1,
            aspect_ratio: '16:9',
            output_format: 'png',
            output_quality: 90,
          },
        });
        const url = extractImageUrl(output);
        if (url) results.push(url);
      } catch (err) {
        console.error(`Image ${i + 1} error:`, err.message);
      }
    }

    if (results.length === 0) {
      return res.status(500).json({ success: false, message: 'Không thể tạo ảnh. Vui lòng thử lại.' });
    }

    res.json({ success: true, images: results });
  } catch (error) {
    console.error('Generate image error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Helper: extract URL from Replicate output ───────────────────
function extractImageUrl(output) {
  if (!output) return null;
  if (typeof output === 'string') {
    if (output.startsWith('http://') || output.startsWith('https://')) return output;
    return null;
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (typeof output === 'object' && output !== null) {
    if (typeof output.url === 'function') { try { const u = output.url(); if (typeof u === 'string' && u.startsWith('http')) return u; } catch {} }
    if (typeof output.url === 'string' && output.url.startsWith('http')) return output.url;
    const str = String(output);
    const m = str.match(/https?:\/\/[^\s"'}]+/);
    if (m) return m[0];
    return null;
  }
  return null;
}

module.exports = router;
