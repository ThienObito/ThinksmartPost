const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { track } = require('../utils/api-tracker');
const { callGemini } = require('../utils/ai-client');
const rag = require('../utils/rag');

const DATA_DIR = path.join(__dirname, '../data');

// ── Extract JSON from AI response (multi-strategy fallback) ────
function extractJSON(text) {
  if (!text) throw new Error('AI trả về nội dung rỗng');

  let cleaned = text.trim();
  // Find first { and strip everything before it (handles backtick+json prefix)
  const braceIdx = cleaned.indexOf('{');
  if (braceIdx >= 0) cleaned = cleaned.slice(braceIdx);
  else throw new Error('No JSON object found in AI response');

  // Remove backtick code block wrappers (if any remain after { extraction)
  cleaned = cleaned.replace(/```/g, '').trim();

  // Strategy 2: Direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Strategy 3: Find first { ... } block (handles extra text before/after JSON)
  const braceMatch = cleaned.match(/{[\s\S]*}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch { /* continue */ }
  }

  // Strategy 4: Try to fix common JSON issues (trailing commas, single quotes, etc.)
  const fixed = cleaned
    .replace(/([{,])\s*'([^']+)'\s*:/g, '$1"$2"')    // single-quoted keys -> double
    .replace(/:\s*'([^']+)'/g, ':"$1"')                // single-quoted values -> double
    .replace(/,\s*([}\]])/g, '$1')                      // trailing commas
    .replace(/\/\/.*$/gm, '');                          // line comments

  try { return JSON.parse(fixed); } catch { /* continue */ }

  // Strategy 5: Find { ... } block in fixed version
  const fixedMatch = fixed.match(/{[\s\S]*}/);
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
  // Case 1: article.content is already HTML string
  if (typeof article.content === 'string' && article.content.trim().startsWith('<') && article.content.trim().length > 20) {
    return article.content;
  }
  
  const parts = [];
  
  // Case 2: intro + sections structure (older prompt format)
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
  
  // Case 3: if article has a body field
  if (parts.length === 0 && article.body) {
    parts.push(`<p>${article.body}</p>`);
  }
  
  // Case 4: if article.content exists but is short/empty, try article.text or body
  if (parts.length === 0 && typeof article.content === 'string' && article.content.trim().length > 0) {
    parts.push(article.content);
  }
  
  // Case 5: summary fallback
  if (parts.length === 0 && article.meta_description) {
    parts.push(`<p>${article.meta_description}</p>`);
  }
  
  const result = parts.length > 0
    ? `<article>${parts.join('\n')}</article>`
    : `<article><p>${article.meta_description || article.summary || 'Nội dung đang được tạo...'}</p></article>`;
    
  if (result.length < 30) {
    console.log('WARNING: buildHtmlContent produced very short content. article keys:', Object.keys(article));
    console.log('WARNING: content preview:', JSON.stringify(article.content).substring(0, 200));
  }
  
  return result;
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

  return `Bạn là chuyên gia viết nội dung SEO chuyên ngành, khách quan.

Hãy viết một bài viết CHUẨN SEO chất lượng cao bằng tiếng Việt về chủ đề: "${topic}"

GÓC VIẾT: ${angle}

${diversityInstruction}

YÊU CẦU SEO:
- Tiêu đề (H1): 50-65 ký tự, hấp dẫn, chứa từ khóa chính ở đầu, KHÔNG chứa tên công ty hay thương hiệu
- Meta description: 155-160 ký tự, chứa từ khóa chính + từ kêu gọi tự nhiên
- Thẻ H2: 4-6 thẻ, mỗi thẻ chứa từ khóa phụ (LSI), phân bố đều trong bài
- Thẻ H3: dùng để chia nhỏ nội dung dưới H2 khi cần
- Mật độ từ khóa: từ khóa chính xuất hiện 3-5 lần trong bài (tiêu đề + H2 + thân bài)
- Từ khóa LSI: 5-7 từ khóa liên quan, phân bố tự nhiên
- Đoạn văn: 2-4 câu/đoạn, tối đa 80 từ/đoạn (mobile-friendly)
- Bullet points: dùng cho danh sách, so sánh, lợi ích
- Internal linking: thêm gợi ý liên kết nội bộ dạng "[internal: chủ đề liên quan]"
- External linking: dẫn nguồn uy tín nếu có số liệu
- URL slug: gợi ý từ tiêu đề, không dấu, dùng dấu gạch ngang

⚠️ TUYỆT ĐỐI KHÔNG được:
- KHÔNG đề cập đến bất kỳ công ty, thương hiệu, website, email, hotline nào
- KHÔNG có phần "Liên hệ chúng tôi", "Gọi ngay", "Đăng ký tư vấn"
- KHÔNG có footer, quảng cáo, call-to-action bán hàng
- KHÔNG giới thiệu hoặc quảng bá bất kỳ dịch vụ/sản phẩm thương mại nào
- KHÔNG sử dụng các cụm như "chúng tôi có", "công ty chúng tôi", "hãy liên hệ"

Xem thêm: [internal: tiêu chuẩn SEO onpage], [internal: tối ưu content chuẩn SEO]

QUAN TRỌNG: Chỉ trả về JSON, không thêm text nào khác.

ĐỊNH DẠNG JSON:
{
  "title": "Tiêu đề hấp dẫn (50-65 ký tự, không có tên công ty)",
  "slug": "slug-tu-tieu-de-khong-dau",
  "content": "<article><h2>...</h2><p>...</p></article>",
  "meta_description": "Mô tả 155-160 ký tự chuẩn SEO",
  "keywords": ["từ khóa chính", "từ khóa LSI 1", "từ khóa LSI 2"]
}`;
};

// ── Simple fallback prompt (no company, no contact) ────────────
const SIMPLE_PROMPT = (topic, articleIndex, totalCount) => {
  const diversityNote = totalCount > 1
    ? `\nBÀI SỐ ${articleIndex + 1}/${totalCount}: Hãy viết với góc nhìn và nội dung KHÁC BIỆT so với các bài khác trong loạt.`
    : '';
  return `Viết bài chuẩn SEO bằng tiếng Việt về: "${topic}"${diversityNote}
Yêu cầu SEO: tiêu đề 50-65 ký tự, H2 4-6 thẻ, meta 155-160 ký tự, từ khóa LSI, đoạn văn ngắn 2-4 câu.
KHÔNG được đề cập đến bất kỳ công ty, thương hiệu, liên hệ hay quảng cáo nào.
Nội dung thuần túy chuyên môn, khách quan.
Thêm gợi ý liên kết nội bộ: [internal: chủ đề liên quan] nếu phù hợp.

Trả về JSON CHUẨN (không thêm text nào khác, "content" PHẢI là string HTML bắt đầu bằng <article>):
{
  "title": "Tiêu đề (50-65 ký tự)",
  "slug": "slug-tu-tieu-de",
  "content": "<article><h2>...</h2><p>...</p></article>",
  "meta_description": "Mô tả 155-160 ký tự",
  "keywords": ["từ khóa chính", "từ khóa LSI"]
}`;
};

// ── Image injection helper ──────────────────────────────────────
function injectImages(htmlContent, count, topic) {
  const LIB_FILE = path.join(DATA_DIR, 'library.json');
  let images = [];
  try {
    const lib = JSON.parse(fs.readFileSync(LIB_FILE, 'utf-8'));
    images = lib.images || [];
  } catch {
    images = [];
  }

  if (images.length === 0) return { content: htmlContent, usedImages: [] };

  // Extract keywords from topic for smart matching
  const topicLower = (topic || '').toLowerCase();
  const topicWords = topicLower.split(/\s+/).filter(w => w.length > 2);

  // Score each image by how many tags match the topic
  const scored = images.map(img => {
    const tags = (img.tags || []).map(t => t.toLowerCase());
    let score = 0;
    // Direct tag match
    for (const word of topicWords) {
      if (tags.some(t => t.includes(word) || word.includes(t))) score += 5;
    }
    // Filename match
    const fname = (img.filename || '').toLowerCase();
    for (const word of topicWords) {
      if (fname.includes(word)) score += 3;
    }
    // Boosts for common terms
    if (topicLower.includes('3d') && tags.some(t => t.includes('3d'))) score += 10;
    if (topicLower.includes('in') && tags.some(t => t.includes('in'))) score += 8;
    if (topicLower.includes('ô tô') && tags.some(t => t.includes('ô tô'))) score += 10;
    if (topicLower.includes('y tế') && tags.some(t => t.includes('y tế'))) score += 10;
    if (topicLower.includes('hàng không') && tags.some(t => t.includes('hàng không'))) score += 10;
    return { img, score };
  });

  // Sort by score (highest first), then shuffle within same score for variety
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.random() - 0.5;
  });

  // Pick top N unique images
  const selected = scored.slice(0, Math.min(count, scored.length)).map(s => s.img);

  // If we have fewer than count, fill with random from remaining
  if (selected.length < count && images.length > selected.length) {
    const remaining = images.filter(img => !selected.includes(img))
      .sort(() => Math.random() - 0.5);
    const fill = remaining.slice(0, count - selected.length);
    selected.push(...fill);
  }

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

      // ── RAG: Inject knowledge context ─────────────────────────
      const ragContext = rag.buildContext(topic, { limit: 3, sources: ['articles', 'templates'] });
      if (ragContext) {
        finalPrompt += ragContext;
        console.log(`  📚 RAG context injected (${ragContext.length} chars)`);
      }

      // 2. Call Gemini (text only — no image generation)
      let article = null;
      let lastError = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const prompt = attempt === 1 ? finalPrompt : SIMPLE_PROMPT(topic, ti, totalCount);
          const temperature = totalCount > 1 ? 1.0 : 0.7;
          track('gemini');
          const rawContent = await callGemini(prompt, { temperature, max_tokens: 12000, timeout: 90000 });
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
      // Clean content: if Gemini double-wrapped JSON inside content
      if (typeof article.content === 'string') {
        const trimmed = article.content.trim();
        // Check if content starts with HTML + JSON (Gemini sometimes wraps JSON)
        const jsonStart = trimmed.indexOf('{');
        if (jsonStart >= 0 && jsonStart < trimmed.indexOf('<article>') + 20) {
          // Try to find and parse JSON inside content
          const jsonPart = trimmed.slice(jsonStart);
          const match = jsonPart.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const reparsed = JSON.parse(match[0]);
              if (reparsed.content) {
                article.content = reparsed.content;
                if (reparsed.title) article.title = reparsed.title;
                if (reparsed.meta_description) article.meta_description = reparsed.meta_description;
                if (reparsed.keywords) article.keywords = reparsed.keywords;
              } else if (reparsed.title) {
                // This was a re-serialized full article JSON, extract content
                article.title = reparsed.title;
                article.content = reparsed.content || article.content;
              }
            } catch { /* not valid JSON, use as-is */ }
          }
        }
      }
      // Log article structure for debugging empty content
      if (!article.content || article.content.length < 30) {
        console.log('  ⚠️ Gemini returned empty/short content. Got fields:', Object.keys(article));
        console.log('  ⚠️ content length:', (article.content || '').length);
      }
      console.log(`  ✅ (${ti + 1}/${totalCount}) Gemini → "${article.title.substring(0, 50)}…"`);

      // 3. Build HTML content
      let htmlContent = buildHtmlContent(article);

      // 3b. Smart image injection
      let usedImages = [];
      if (imgCount > 0) {
        const result = injectImages(htmlContent, imgCount, topic);
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
