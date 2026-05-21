const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { track } = require('../utils/api-tracker');

const DATA_DIR = path.join(__dirname, '../data');

// ── Extract JSON from AI response (multi-strategy fallback) ────
function extractJSON(text) {
  if (!text) throw new Error('AI trả về nội dung rỗng');

  let cleaned = text.trim();

  // Strategy 1: Remove markdown code blocks
  cleaned = cleaned.replace(/```(?:json)?\n?/gi, '').replace(/```\s*$/gi, '').trim();

  // Strategy 2: Direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Strategy 3: Find first { ... } block (handles extra text before/after JSON)
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch { /* continue */ }
  }

  // Strategy 4: Try to fix common JSON issues (trailing commas, single quotes, etc.)
  const fixed = cleaned
    .replace(/([{,])\s*'([^']+)'\s*:/g, '$1"$2":')    // single-quoted keys -> double
    .replace(/:\s*'([^']+)'/g, ':"$1"')                // single-quoted values -> double
    .replace(/,\s*([}\]])/g, '$1')                      // trailing commas
    .replace(/\/\/.*$/gm, '');                          // line comments

  try { return JSON.parse(fixed); } catch { /* continue */ }

  // Strategy 5: Find { ... } block in fixed version
  const fixedMatch = fixed.match(/\{[\s\S]*\}/);
  if (fixedMatch) {
    try { return JSON.parse(fixedMatch[0]); } catch { /* continue */ }
  }

  // Strategy 6: If AI returned structured sections (intro, sections, cta), try to use as-is
  if (text.includes('<h2>') || text.includes('<article>') || text.includes('</h')) {
    return {
      title: text.match(/<h1>([^<]+)<\/h1>/) ? text.match(/<h1>([^<]+)<\/h1>/)[1].trim() : '',
      content: text,
      meta_description: '',
      keywords: [],
    };
  }

  throw new Error('Không thể parse JSON từ AI. AI trả về: ' + text.substring(0, 200) + '...');
}

// ── Build HTML from structured or flat content ──────────────────
function buildHtmlContent(article) {
  if (typeof article.content === 'string' && article.content.startsWith('<')) {
    return article.content;
  }
  const parts = [];
  if (article.intro) parts.push(`<p>${article.intro}</p>`);
  if (Array.isArray(article.sections)) {
    for (const sec of article.sections) {
      if (sec.heading) parts.push(`<h2>${sec.heading}</h2>`);
      if (sec.content) parts.push(`<p>${sec.content}</p>`);
      if (Array.isArray(sec.subsections)) {
        for (const sub of sec.subsections) {
          if (sub.subheading) parts.push(`<h3>${sub.subheading}</h3>`);
          if (sub.content) parts.push(`<div>${sub.content}</div>`);
        }
      }
    }
  }
  // KHÔNG thêm CTA, không thêm footer, không thông tin liên hệ
  return parts.length > 0
    ? `<article>${parts.join('\n')}</article>`
    : `<article><p>${article.meta_description || ''}</p></article>`;
}

// ═══════════════════════════════════════════════════════════════
// ANGLES MỞ RỘNG: 20 góc nhìn khác nhau để đa dạng hóa nội dung
// ═══════════════════════════════════════════════════════════════
const ANGLES = [
  'Tổng quan, định nghĩa cơ bản và giới thiệu tổng thể về chủ đề.',
  'So sánh chi tiết các phương án, ưu nhược điểm và bảng so sánh.',
  'Nghiên cứu điển hình, số liệu 2026, dữ liệu thực tế và dự báo tương lai.',
  'Hướng dẫn thực hành từng bước, triển khai ứng dụng thực tế.',
  'Các câu hỏi thường gặp, giải đáp thắc mắc và lưu ý quan trọng.',
  'Góc nhìn chuyên gia, phân tích chuyên sâu và khuyến nghị chuyên môn.',
  'Xu hướng công nghệ mới nhất, đổi mới sáng tạo và tác động ngành.',
  'Phân tích chi phí - lợi ích, tối ưu ngân sách và ROI.',
  'Tiêu chuẩn kỹ thuật, quy trình kiểm định và đảm bảo chất lượng.',
  'Nghiên cứu thị trường, nhu cầu người dùng và cơ hội ứng dụng.',
  'Tối ưu hóa quy trình, cải tiến hiệu suất và năng suất.',
  'Bài học từ thực tiễn, case study thành công và thất bại.',
  'Phân tích rủi ro, giải pháp khắc phục và dự phòng.',
  'Vật liệu và công nghệ chế tạo tiên tiến, so sánh đặc tính.',
  'Quy trình thiết kế từ ý tưởng đến sản phẩm hoàn thiện.',
  'Ứng dụng trong các ngành cụ thể: y tế, hàng không, ô tô, điện tử.',
  'So sánh giữa phương pháp truyền thống và công nghệ mới.',
  'Phân tích tác động môi trường và phát triển bền vững.',
  'Đánh giá độ bền, kiểm tra chất lượng và tuổi thọ sản phẩm.',
  'Tích hợp IoT, tự động hóa và chuyển đổi số trong lĩnh vực.',
];

// ═══════════════════════════════════════════════════════════════
// SUB-TOPIC TEMPLATES: khi QTY > 1, AI sẽ chọn hướng khác nhau
// ═══════════════════════════════════════════════════════════════
const SUB_TOPIC_DIRECTIONS = [
  'Hãy viết về tổng quan và khái niệm cơ bản, phù hợp cho người mới bắt đầu.',
  'Hãy tập trung vào so sánh các giải pháp, công nghệ hoặc phương pháp khác nhau.',
  'Hãy viết về ứng dụng thực tế trong các ngành cụ thể với ví dụ chi tiết.',
  'Hãy viết dưới dạng hướng dẫn từng bước (step-by-step guide).',
  'Hãy phân tích xu hướng mới nhất, dự báo và tương lai của chủ đề này.',
  'Hãy viết về các tiêu chuẩn kỹ thuật, quy trình kiểm tra và đảm bảo chất lượng.',
  'Hãy viết về tối ưu hóa chi phí, phân tích ROI và hiệu quả kinh tế.',
  'Hãy viết dưới góc nhìn so sánh giữa phương pháp truyền thống và hiện đại.',
  'Hãy tập trung vào vật liệu, công nghệ chế tạo và các yếu tố kỹ thuật.',
  'Hãy viết về những sai lầm thường gặp và cách khắc phục.',
  'Hãy viết dưới dạng nghiên cứu điển hình (case study) với số liệu thực tế.',
  'Hãy viết về tác động môi trường và phát triển bền vững liên quan.',
];

// ═══════════════════════════════════════════════════════════════
// PROMPT CHÍNH: SẠCH, KHÔNG CÓ THÔNG TIN CÔNG TY HAY LIÊN HỆ
// ═══════════════════════════════════════════════════════════════

const SEO_PROMPT = (topic, angleIdx, subDirection, articleIndex, totalCount) => {
  const angle = ANGLES[angleIdx % ANGLES.length];
  const direction = subDirection || '';

  const diversityInstruction = totalCount > 1
    ? `\nQUAN TRỌNG - ĐA DẠNG HÓA: Đây là bài viết số ${articleIndex + 1}/${totalCount} trong loạt bài về chủ đề "${topic}". Bài viết này PHẢI hoàn toàn khác biệt so với các bài khác trong loạt. Cụ thể:
- Tiêu đề: KHÔNG trùng lặp ý tưởng với các bài khác
- Góc nhìn: ${direction || 'Khác biệt, độc đáo'}
- Cấu trúc bài viết: Khác biệt (có thể dùng FAQ, list, so sánh, hướng dẫn...)
- Ví dụ và số liệu: Sử dụng ví dụ HOÀN TOÀN khác
- Từ ngữ: Tránh dùng các cụm từ giống bài khác
=> Mỗi bài là một tác phẩm độc lập, không chỉ là biến thể của cùng một nội dung.`
    : '';

  return `Bạn là chuyên gia viết nội dung chuyên ngành, khách quan.

Hãy viết một bài viết chất lượng cao bằng tiếng Việt về chủ đề: "${topic}"

GÓC VIẾT: ${angle}

${diversityInstruction}

YÊU CẦU NỘI DUNG:
- Tiêu đề: 50-65 ký tự, hấp dẫn, chứa từ khóa chính, KHÔNG chứa tên công ty hay thương hiệu
- Nội dung: 1500-2500 từ tiếng Việt, chuyên nghiệp, dễ hiểu
- Cấu trúc: H2 → H3 → Bullet points/Bảng → Kết luận (KHÔNG có CTA, KHÔNG có thông tin liên hệ)
- Số liệu mới cập nhật, ví dụ thực tế, khách quan

⚠️ TUYỆT ĐỐI KHÔNG được:
- KHÔNG đề cập đến bất kỳ công ty, thương hiệu, website, email, hotline nào
- KHÔNG có phần "Liên hệ chúng tôi", "Gọi ngay", "Đăng ký tư vấn"
- KHÔNG có footer, quảng cáo, call-to-action bán hàng
- KHÔNG giới thiệu hoặc quảng bá bất kỳ dịch vụ/sản phẩm thương mại nào
- KHÔNG sử dụng các cụm như "chúng tôi có", "công ty chúng tôi", "hãy liên hệ"

=> Nội dung thuần túy chuyên môn, khách quan, giá trị cho người đọc.

QUAN TRỌNG: Chỉ trả về JSON, không thêm text nào khác.

ĐỊNH DẠNG JSON:
{
  "title": "Tiêu đề hấp dẫn (không có tên công ty)",
  "content": "<article><h2>...</h2><p>...</p></article>",
  "meta_description": "Mô tả 145-160 ký tự",
  "keywords": ["từ khóa 1", "từ khóa 2"]
}`;
};

// ── Simple fallback prompt (no company, no contact) ────────────
const SIMPLE_PROMPT = (topic, articleIndex, totalCount) => {
  const diversityNote = totalCount > 1
    ? `\nBÀI SỐ ${articleIndex + 1}/${totalCount}: Hãy viết với góc nhìn và nội dung KHÁC BIỆT so với các bài khác trong loạt.`
    : '';
  return `Viết bài chuyên môn bằng tiếng Việt về: "${topic}"${diversityNote}

KHÔNG được đề cập đến bất kỳ công ty, thương hiệu, liên hệ hay quảng cáo nào.
Nội dung thuần túy chuyên môn, khách quan.

Trả về JSON CHUẨN (không thêm text nào khác):
{
  "title": "Tiêu đề",
  "content": "<article><h2>...</h2><p>...</p></article>",
  "meta_description": "Mô tả",
  "keywords": ["từ khóa"]
}`;
};

// ── Image injection helper ──────────────────────────────────────
function injectImages(htmlContent, count) {
  const LIB_FILE = path.join(DATA_DIR, 'library.json');
  let images = [];
  try {
    const lib = JSON.parse(fs.readFileSync(LIB_FILE, 'utf-8'));
    images = lib.images || [];
  } catch {
    // Fallback: use hardcoded images from uploads
    images = [
      { url: '/uploads/10_anh-1-scaled.jpg', alt: 'Máy in 3D công nghiệp' },
      { url: '/uploads/10_Engine-Blade.png', alt: 'Chi tiết Engine Blade in 3D' },
      { url: '/uploads/11_Combustion-Chamber.png', alt: 'Combustion Chamber in 3D' },
    ];
  }

  if (images.length === 0) return { content: htmlContent, usedImages: [] };

  // Pick random images, no duplicates
  const shuffled = [...images].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  let result = htmlContent;
  const usedUrls = [];

  // Replace {{img_1}}, {{img_2}}... placeholders
  for (let i = 0; i < selected.length; i++) {
    const img = selected[i];
    const url = img.url || `/uploads/${img.filename}`;
    const alt = (img.alt || `Hình ảnh minh họa ${i + 1}`)
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const imgTag = `<figure style="margin:20px 0;text-align:center"><img src="${url}" alt="${alt}" style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1)" /><figcaption style="font-size:12px;color:#888;margin-top:6px;font-style:italic">${alt}</figcaption></figure>`;
    const placeholder = `{{img_${i + 1}}}`;
    if (result.includes(placeholder)) {
      result = result.replace(placeholder, imgTag);
      usedUrls.push(url);
    }
  }

  // If there are still unmatched placeholders, insert at heading boundaries
  for (let i = 0; i < selected.length && result.includes('{{img_'); i++) {
    const match = result.match(/\{\{img_\d+\}\}/);
    if (match) {
      // Insert after first </h2> or after <article>
      const afterH2 = result.indexOf('</h2>');
      const idx = afterH2 > 0 ? afterH2 + 5 : result.indexOf('<article>') + 9;
      const url = selected[i].url || `/uploads/${selected[i].filename}`;
      const alt = (selected[i].alt || `Hình ảnh minh họa ${i + 1}`)
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const imgTag = `<figure style="margin:20px 0;text-align:center"><img src="${url}" alt="${alt}" style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1)" /><figcaption style="font-size:12px;color:#888;margin-top:6px;font-style:italic">${alt}</figcaption></figure>`;
      result = result.slice(0, idx) + imgTag + result.slice(idx);
      result = result.replace(/\{\{img_\d+\}\}/, '');
      usedUrls.push(url);
    }
  }

  // Clean up any remaining unreplaced placeholders
  result = result.replace(/\{\{img_\d+\}\}/g, '');
  return { content: result, usedImages: usedUrls };
}

// ── Image placement prompt modifier ─────────────────────────────
function addImageInstructions(prompt, count) {
  if (!count || count < 1) return prompt;
  return prompt + `\n\nYÊU CẦU CHÈN ẢNH:
- Chèn ${count} placeholder ảnh vào bài viết ở vị trí thích hợp
- Dùng {{img_1}}, {{img_2}}${count >= 3 ? ', {{img_3}}' : ''}${count >= 4 ? ', {{img_4}}' : ''}${count >= 5 ? ', {{img_5}}' : ''} giữa các đoạn văn
- Đặt sau mỗi phần H2, giữa các đoạn nội dung khác nhau
- KHÔNG đặt ảnh ở đầu bài viết (trước H2 đầu tiên)
- Mỗi ảnh cách nhau ít nhất 2-3 đoạn văn
- Đảm bảo bố cục: văn bản → ảnh → văn bản`;
}

// ── Handler ─────────────────────────────────────────────────────
async function createArticleHandler(req, res) {
  const { topics, category = 'giai-phap', prompt_template, smart_images = false, image_count = 2 } = req.body;
  const userId = req.user?.id || 'unknown';

  if (!topics || !Array.isArray(topics) || topics.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập ít nhất 1 chủ đề' });
  }

  const rawTopics = topics.filter(Boolean);
  const totalCount = rawTopics.length;
  console.log(`📝 [${userId}] Tạo ${totalCount} bài viết (chỉ text, không ảnh)…`);
  const results = [];

  for (let ti = 0; ti < totalCount; ti++) {
    const topic = rawTopics[ti];
    try {
      // 1. Build prompt with angle + sub-direction + diversity instruction
      const angleIdx = ti;
      const subIdx = ti % SUB_TOPIC_DIRECTIONS.length;
      const subDirection = SUB_TOPIC_DIRECTIONS[subIdx];

      let finalPrompt;
      if (prompt_template) {
        let tp = prompt_template
          .replace(/\{topic\}/g, topic)
          .replace(/\{angle\}/g, ANGLES[angleIdx % ANGLES.length] || '');
        if (totalCount > 1) {
          tp += `\n\nQUAN TRỌNG: Đây là bài ${ti + 1}/${totalCount}. Hãy tạo nội dung KHÁC BIỆT hoàn toàn so với các bài khác. KHÔNG thêm thông tin công ty, liên hệ, quảng cáo.`;
        }
        finalPrompt = tp;
      } else {
        finalPrompt = SEO_PROMPT(topic, angleIdx, subDirection, ti, totalCount);
      }

      // Add smart image instructions
      const imgCount = smart_images ? Math.min(Math.max(parseInt(image_count) || 2, 1), 5) : 0;
      if (imgCount > 0) {
        finalPrompt = addImageInstructions(finalPrompt, imgCount);
        console.log(`  🖼️ Smart images ON: ${imgCount} images/article`);
      }

      // 2. Call DeepSeek (text only — no image generation)
      let article = null;
      let lastError = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const prompt = attempt === 1 ? finalPrompt : SIMPLE_PROMPT(topic, ti, totalCount);
          const temperature = totalCount > 1 ? 1.0 : 0.7;
          track('deepseek');
          const aiRes = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            { model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature, max_tokens: 8000 },
            { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } },
          );

          const rawContent = aiRes.data.choices[0].message.content;
          article = extractJSON(rawContent);
          if (article && (article.title || article.content)) break;
        } catch (err) {
          lastError = err.message;
          console.log(`  ⚠ Attempt ${attempt} failed: ${err.message}`);
        }
      }

      if (!article) {
        throw new Error(lastError || 'Không thể tạo bài viết từ AI');
      }

      if (!article.title) article.title = topic;
      if (!article.content) article.content = '';
      console.log(`  ✅ (${ti + 1}/${totalCount}) DeepSeek → "${article.title.substring(0, 50)}…"`);

      // 3. Build HTML content
      let htmlContent = buildHtmlContent(article);

      // 3b. Smart image injection
      let usedImages = [];
      if (imgCount > 0) {
        const result = injectImages(htmlContent, imgCount);
        htmlContent = result.content;
        usedImages = result.usedImages;
        console.log(`  🖼️ Injected ${usedImages.length} images into article`);
      }

      // 4. Save
      const ts = new Date().toISOString().replace(/[:T-]/g, '').slice(0, 15);
      const safeTitle = (article.title || topic)
        .replace(/[^a-zA-Z0-9À-ỹ\s]/gi, '').trim().replace(/\s+/g, '_').substring(0, 60);

      const jsonData = {
        title: article.title,
        slug: article.slug || safeTitle.toLowerCase(),
        content: htmlContent,
        summary: article.meta_description || `Bài viết chuyên sâu về ${topic} - kiến thức và phân tích chuyên môn.`,
        thumbnail: usedImages.length > 0 ? usedImages[0] : '',
        category_slug: category,
        keywords: article.keywords || [],
        altImages: usedImages,
        relatedPosts: article.related_posts || [],
        images: usedImages,
        userId,
        published: false,
        createdAt: new Date().toISOString(),
      };

      const filename = `${ts}_${safeTitle}${totalCount > 1 ? '_p' + (ti + 1) : ''}.json`;
      fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(jsonData, null, 2), 'utf-8');
      results.push({ success: true, title: article.title, file: filename });
      console.log(`  ✅ Saved → ${filename}`);
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      console.error(`  ❌ ${topic}:`, errMsg.substring(0, 200));
      results.push({ success: false, topic, error: errMsg });
    }
  }

  res.json({ success: true, results });
}

module.exports = createArticleHandler;
