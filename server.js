require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const createArticleHandler = require('./api/create-article');
const suggestTopicsHandler = require('./api/suggest-topics');

const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ====================== DATA FOLDER ======================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ====================== ROUTE TRANG CHỦ ======================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====================== API ARTICLES ======================
app.get('/api/articles', (req, res) => {
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        const list = files.map(file => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
                return { file, ...data };
            } catch (e) { return null; }
        }).filter(Boolean);
        res.json(list);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.delete('/api/articles/:filename', (req, res) => {
    const filePath = path.join(DATA_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: "File không tồn tại" });
    }
});

// ====================== WORDPRESS ======================
const WP_URL = process.env.WP_URL || 'https://thinksmart.vn';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

async function createWPPost(post) {
    if (!WP_APP_PASSWORD) {
        return { success: false, error: 'Thiếu WP_APP_PASSWORD trong .env' };
    }
    const credentials = Buffer.from(`admin:${WP_APP_PASSWORD}`).toString('base64');
    const catId = post.category_slug === 'ung-dung' ? 3 : 2;

    try {
        const response = await axios.post(
            `${WP_URL}/wp-json/wp/v2/posts`,
            {
                title: post.title,
                content: post.content,
                excerpt: post.summary || '',
                status: 'publish',
                categories: [catId]
            },
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return { success: true, title: post.title, wpId: response.data.id };
    } catch (error) {
        console.error(error.response?.data || error.message);
        return { success: false, title: post.title, error: error.message };
    }
}

app.post('/api/post-all', async (req, res) => {
    const { files, deleteFromWP = false } = req.body;
    if (!files || files.length === 0) return res.status(400).json({ success: false });

    let successCount = 0;
    const results = [];

    for (const filename of files) {
        try {
            const filePath = path.join(DATA_DIR, filename);
            if (!fs.existsSync(filePath)) continue;

            const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const result = await createWPPost(post);

            if (result.success && deleteFromWP) {
                fs.unlinkSync(filePath);
            }
            if (result.success) successCount++;
            results.push(result);
        } catch (e) {
            results.push({ success: false, filename, error: e.message });
        }
    }

    res.json({ success: true, successCount, results });
});

// ====================== WORDPRESS API ======================
app.get('/api/wp-categories', async (req, res) => {
    try {
        const credentials = Buffer.from(`admin:${WP_APP_PASSWORD}`).toString('base64');
        const response = await axios.get(`${WP_URL}/wp-json/wp/v2/categories`, {
            headers: { Authorization: `Basic ${credentials}` }
        });
        res.json(response.data);
    } catch (e) {
        res.json([{ slug: 'giai-phap', name: 'Giải pháp' }, { slug: 'ung-dung', name: 'Ứng dụng' }]);
    }
});

app.get('/api/wp-posts', async (req, res) => {
    try {
        const credentials = Buffer.from(`admin:${WP_APP_PASSWORD}`).toString('base64');
        const response = await axios.get(`${WP_URL}/wp-json/wp/v2/posts?per_page=50`, {
            headers: { Authorization: `Basic ${credentials}` }
        });
        res.json(response.data);
    } catch (e) {
        res.status(500).json([]);
    }
});

app.delete('/api/wp-posts/:id', async (req, res) => {
    try {
        const credentials = Buffer.from(`admin:${WP_APP_PASSWORD}`).toString('base64');
        await axios.delete(`${WP_URL}/wp-json/wp/v2/posts/${req.params.id}?force=true`, {
            headers: { Authorization: `Basic ${credentials}` }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.put('/api/wp-posts/:id', async (req, res) => {
    try {
        const credentials = Buffer.from(`admin:${WP_APP_PASSWORD}`).toString('base64');
        const response = await axios.post(
            `${WP_URL}/wp-json/wp/v2/posts/${req.params.id}`,
            req.body,
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json({ success: true, data: response.data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.response?.data || e.message });
    }
});

// ====================== MOUNT API HANDLERS ======================
app.post('/api/create-article', createArticleHandler);
app.post('/api/suggest-topics', suggestTopicsHandler);

// ====================== KHỞI ĐỘNG ======================
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});