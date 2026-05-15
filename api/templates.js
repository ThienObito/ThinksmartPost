/**
 * Content Templates API v2 — Full CRUD + search + duplicate + suggest.
 *
 * Fields: id, name, category, tags[], variables[], structure, tone,
 *         target_length, seo_focus, prompt_template, is_public,
 *         user_id, created_at, updated_at
 *
 * Variables: user can insert {{var_name}} in prompt_template.
 * When creating article, front-end shows fields for each variable.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '..', 'data', 'templates.json');

// ── File I/O ────────────────────────────────────────────────────

function loadTemplates() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveTemplates(templates) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(templates, null, 2), 'utf-8');
}

// ── Helper: extract {{variable}} names from prompt ──────────────
function extractVariables(prompt) {
  const regex = /\{\{(\w+)\}\}/g;
  const vars = [];
  let match;
  while ((match = regex.exec(prompt)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1]);
  }
  return vars;
}

// ── Helper: allowed fields for create/update ────────────────────
const ALLOWED = ['name', 'category', 'tags', 'variables', 'structure', 'tone', 'target_length', 'seo_focus', 'prompt_template', 'is_public'];

function sanitizeBody(body, existing) {
  const data = {};
  for (const key of ALLOWED) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  // Auto-extract variables from prompt if not explicitly provided
  if (data.prompt_template && (!body.variables || !Array.isArray(body.variables) || body.variables.length === 0)) {
    data.variables = extractVariables(data.prompt_template);
  }
  return data;
}

// ── GET /api/templates ──────────────────────────────────────────
// Query: ?category=Blog&search=từ khóa&tag=seo&is_public=true
router.get('/', authRequired, (req, res) => {
  try {
    let templates = loadTemplates();
    const { category, search, tag, is_public } = req.query;

    // Permission filter
    if (req.user.role !== 'admin') {
      templates = templates.filter(t => t.is_public === true || t.user_id === req.user.id);
    }

    // Filter by category
    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    // Filter by tag
    if (tag) {
      const tagLower = tag.toLowerCase();
      templates = templates.filter(t => Array.isArray(t.tags) && t.tags.some(tt => tt.toLowerCase().includes(tagLower)));
    }

    // Filter by public
    if (is_public !== undefined) {
      templates = templates.filter(t => t.is_public === (is_public === 'true'));
    }

    // Search by name, tag, or variable
    if (search) {
      const q = search.toLowerCase();
      templates = templates.filter(t =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (Array.isArray(t.tags) && t.tags.some(tt => tt.toLowerCase().includes(q))) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.prompt_template && t.prompt_template.toLowerCase().includes(q))
      );
    }

    res.json({ success: true, templates });
  } catch (error) {
    console.error('GET /templates error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/templates ─────────────────────────────────────────
router.post('/', authRequired, (req, res) => {
  try {
    const body = sanitizeBody(req.body);
    if (!body.name || !body.prompt_template) {
      return res.status(400).json({ success: false, message: 'Name and prompt_template are required' });
    }

    const templates = loadTemplates();
    const newTemplate = {
      id: `tmpl-${uuidv4().slice(0, 8)}`,
      name: body.name,
      category: body.category || 'Blog',
      tags: Array.isArray(body.tags) ? body.tags : [],
      variables: body.variables || extractVariables(body.prompt_template),
      structure: body.structure || '{}',
      tone: body.tone || 'Chuyên nghiệp',
      target_length: body.target_length || 1200,
      seo_focus: body.seo_focus || '',
      prompt_template: body.prompt_template,
      is_public: body.is_public === true,
      user_id: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    templates.push(newTemplate);
    saveTemplates(templates);
    res.status(201).json({ success: true, template: newTemplate });
  } catch (error) {
    console.error('POST /templates error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/templates/duplicate/:id ──────────────────────────
router.post('/duplicate/:id', authRequired, (req, res) => {
  try {
    const templates = loadTemplates();
    const source = templates.find(t => t.id === req.params.id);
    if (!source) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    if (req.user.role !== 'admin' && !source.is_public && source.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const dup = {
      ...source,
      id: `tmpl-${uuidv4().slice(0, 8)}`,
      name: `${source.name} (Copy)`,
      user_id: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    delete dup._id;

    templates.push(dup);
    saveTemplates(templates);
    res.status(201).json({ success: true, template: dup });
  } catch (error) {
    console.error('DUPLICATE error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/templates/suggest ────────────────────────────────
// Uses DeepSeek to suggest a template structure based on user description
router.post('/suggest', authRequired, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ success: false, message: 'Please describe the content type you need' });
    }

    const prompt = `Bạn là chuyên gia Content Strategy. Dựa trên mô tả sau, hãy đề xuất một TEMPLATE VIẾT BÀI CHUẨN SEO.

NGƯỜI DÙNG MÔ TẢ: "${description}"

HÃY TRẢ VỀ JSON CHÍNH XÁC (không thêm text ngoài JSON):
{
  "name": "Tên template đề xuất",
  "category": "Blog | Product Review | Case Study | Tin tức | Khuyến mãi",
  "tags": ["tag1", "tag2", "tag3"],
  "tone": "Giọng văn phù hợp",
  "target_length": 1500,
  "seo_focus": "Chiến lược SEO chính",
  "structure": "Cấu trúc bài viết dạng JSON array sections",
  "prompt_template": "Full prompt cho AI, dùng {{variable}} cho các biến cần điền. Bắt đầu bằng: 'Bạn là...'"
}`;

    const aiRes = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      { model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.8, max_tokens: 3000 },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
    );

    let text = aiRes.data.choices[0].message.content;
    text = text.replace(/```(?:json)?\n?/gi, '').replace(/```\s*$/gi, '').trim();
    let suggestion;
    try {
      suggestion = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      suggestion = match ? JSON.parse(match[0]) : null;
    }
    if (!suggestion) {
      return res.status(500).json({ success: false, message: 'AI could not generate suggestion' });
    }

    // Auto-extract variables
    if (suggestion.prompt_template && !suggestion.variables) {
      suggestion.variables = extractVariables(suggestion.prompt_template);
    }

    res.json({ success: true, suggestion });
  } catch (error) {
    console.error('SUGGEST error:', error);
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
});

// ── POST /api/templates/preview/:id ────────────────────────────
// Generates a short sample using the template
router.post('/preview/:id', authRequired, async (req, res) => {
  try {
    const templates = loadTemplates();
    const tmpl = templates.find(t => t.id === req.params.id);
    if (!tmpl) return res.status(404).json({ success: false, message: 'Template not found' });
    if (req.user.role !== 'admin' && !tmpl.is_public && tmpl.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    // Fill variables with sample values from front-end or use defaults
    const varValues = req.body.variables || {};
    let filledPrompt = tmpl.prompt_template;
    const regex = /\{\{(\w+)\}\}/g;
    filledPrompt = filledPrompt.replace(regex, (m, v) => varValues[v] || `[${v}]`);

    // Request a short sample from DeepSeek
    const previewPrompt = filledPrompt + '\n\nQUAN TRỌNG: Chỉ viết TÓM TẮT ngắn 150-200 từ, không cần bài đầy đủ. Trả về JSON: {"preview": "nội dung tóm tắt"}';

    const aiRes = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      { model: 'deepseek-chat', messages: [{ role: 'user', content: previewPrompt }], temperature: 0.7, max_tokens: 1000 },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
    );

    let text = aiRes.data.choices[0].message.content;
    text = text.replace(/```(?:json)?\n?/gi, '').replace(/```\s*$/gi, '').trim();
    let result;
    try { result = JSON.parse(text); } catch {
      const match = text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { preview: text.substring(0, 500) };
    }

    res.json({ success: true, preview: result.preview || text.substring(0, 500) });
  } catch (error) {
    console.error('PREVIEW error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/templates/:id ──────────────────────────────────────
router.get('/:id', authRequired, (req, res) => {
  try {
    const templates = loadTemplates();
    const tmpl = templates.find(t => t.id === req.params.id);
    if (!tmpl) return res.status(404).json({ success: false, message: 'Template not found' });
    if (req.user.role !== 'admin' && !tmpl.is_public && tmpl.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    res.json({ success: true, template: tmpl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── PUT /api/templates/:id ──────────────────────────────────────
router.put('/:id', authRequired, (req, res) => {
  try {
    const templates = loadTemplates();
    const index = templates.findIndex(t => t.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, message: 'Template not found' });

    const tmpl = templates[index];
    if (req.user.role !== 'admin' && tmpl.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const updates = sanitizeBody(req.body, tmpl);
    for (const key of Object.keys(updates)) {
      tmpl[key] = updates[key];
    }
    tmpl.updated_at = new Date().toISOString();
    templates[index] = tmpl;
    saveTemplates(templates);
    res.json({ success: true, template: tmpl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── DELETE /api/templates/:id ───────────────────────────────────
router.delete('/:id', authRequired, (req, res) => {
  try {
    let templates = loadTemplates();
    const index = templates.findIndex(t => t.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, message: 'Template not found' });
    const tmpl = templates[index];
    if (req.user.role !== 'admin' && tmpl.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    templates.splice(index, 1);
    saveTemplates(templates);
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
