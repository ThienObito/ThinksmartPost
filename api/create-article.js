const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Replicate = require('replicate');

const DATA_DIR = path.join(__dirname, '../data');
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN
});

// Hàm extract JSON an toàn
function extractJSON(text) {
    if (!text) throw new Error("AI trả về rỗng");
    
    // Loại bỏ markdown code block
    text = text.replace(/```json\n?/gi, '').replace(/```\s*$/gi, '').trim();
    
    try {
        return JSON.parse(text);
    } catch (e) {
        // Thử tìm JSON object trong text
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {}
        }
        throw new Error("Không parse được JSON từ AI");
    }
}

// Hàm tạo ảnh bằng Flux Schnell
async function generateImage(prompt) {
    try {
        const output = await replicate.run(
            "black-forest-labs/flux-schnell",
            {
                input: {
                    prompt: prompt,
                    go_fast: true,
                    megapixels: "1",
                    num_outputs: 1,
                    aspect_ratio: "16:9",
                    output_format: "png",
                    output_quality: 90
                }
            }
        );
        return output[0];
    } catch (error) {
        console.error("❌ Lỗi tạo ảnh:", error.message);
        return null;
    }
}

// ==================== HÀM CHÍNH TẠO BÀI VIẾT ====================
async function createArticleHandler(req, res) {
    const { topics, category = 'giai-phap', style = 'Professional' } = req.body;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập ít nhất 1 chủ đề" });
    }

    console.log("📝 Đang tạo bài viết cho:", topics);
    const results = [];

    for (const topic of topics) {
        try {
            // 1. Gọi DeepSeek
            const prompt = `Bạn là Senior SEO Content Writer chuyên nghiệp cho Thinksmart.vn.

Hãy viết một bài BLOG CHI TIẾT, CHẤT LƯỢNG CAO, chuẩn SEO 2026 về chủ đề: "${topic}"

YÊU CẦU:
- Độ dài: 1800 - 2500 từ
- Ngôn ngữ tiếng Việt, giọng văn chuyên nghiệp, dễ hiểu
- Cấu trúc chuẩn SEO: Mở đầu hấp dẫn, H2, H3 rõ ràng, bullet points, bảng so sánh (nếu có), ví dụ thực tế, số liệu mới 2026
- Kết thúc bằng CTA mạnh: Liên hệ Thinksmart.vn
- Nội dung ORIGINAL, mang giá trị thực tế cao

TRẢ VỀ CHÍNH XÁC ĐỊNH DẠNG JSON (không thêm text nào ngoài JSON):

{
  "title": "Tiêu đề bài viết hấp dẫn (50-65 ký tự)",
  "content": "<article><h2>...</h2><p>...</p>...</article>",
  "meta_description": "Mô tả meta 145-160 ký tự",
  "keywords": ["từ khóa chính", "từ khóa phụ"]
}`;

            const aiRes = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 8000
            }, {
                headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }
            });

            let article = extractJSON(aiRes.data.choices[0].message.content);
            console.log("✅ DeepSeek trả về thành công cho:", topic);

            // 2. Tạo ảnh (nếu có REPLICATE_API_TOKEN)
            const imageUrls = [];
            if (process.env.REPLICATE_API_TOKEN) {
                const imagePrompts = [
                    `Professional modern photo of ${topic}, high-tech industrial style, clean background`,
                    `Detailed close-up of ${topic}, technical photography, professional lighting`
                ];

                for (const imgPrompt of imagePrompts) {
                    const imgUrl = await generateImage(imgPrompt);
                    if (imgUrl) imageUrls.push(imgUrl);
                }
            } else {
                console.log("⚠️ Bỏ qua tạo ảnh (chưa có REPLICATE_API_TOKEN)");
            }

            // 3. Chèn ảnh vào nội dung
            let finalContent = article.content || `<article><h2>${article.title || topic}</h2><p>${article.meta_description || ''}</p></article>`;
            imageUrls.forEach((url, i) => {
                finalContent += `<img src="${url}" alt="Hình ${i+1} - ${topic}" style="max-width:100%; border-radius:12px; margin:20px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">`;
            });

            // 4. Lưu file JSON
            const timestamp = new Date().toISOString().slice(0,19).replace(/[:T-]/g, '');
            const safeTitle = (article.title || topic).replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 60);
            const baseName = `${timestamp}_${safeTitle}`;

            const jsonData = {
                title: article.title || topic,
                content: finalContent,
                summary: article.meta_description || `Khám phá ${topic} - Giải pháp từ Thinksmart.vn`,
                thumbnail: imageUrls[0] || "",
                category_slug: category,
                images: imageUrls,
                createdAt: new Date().toISOString()
            };

            fs.writeFileSync(path.join(DATA_DIR, `${baseName}.json`), JSON.stringify(jsonData, null, 2));

            results.push({ success: true, title: article.title || topic, file: `${baseName}.json` });
            console.log("✅ Hoàn thành bài viết:", article.title || topic);

        } catch (error) {
            console.error("❌ Lỗi khi tạo bài viết cho topic:", topic, "→", error.message);
            if (error.response) {
                console.error("DeepSeek response:", error.response.data);
            }
            results.push({ success: false, topic, error: error.message });
        }
    }

    res.json({ success: true, results });
}

module.exports = createArticleHandler;