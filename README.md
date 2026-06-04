# QTPosterPro

**Công cụ AI tạo nội dung SEO & đăng bài tự động lên WordPress**

Dashboard dark theme "Midnight Command Center" — tạo bài viết, quản lý template AI, đăng hàng loạt lên WordPress, analytics, thư viện ảnh, ghi chú, scheduling.

---

## ✨ Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 🤖 **Tạo nội dung AI** | Gemini 2.5 Flash viết bài chuẩn SEO, 12 persona AI khác nhau |
| 🖼️ **Ảnh thông minh** | AI tự sinh/minh họa ảnh cho bài viết |
| 🌐 **WordPress** | Đăng bài, quản lý posts, categories qua REST API |
| 📅 **Lên lịch** | Tự động đăng bài theo lịch, chọn giờ thủ công |
| 📊 **Analytics** | Performance, Keywords, Gap Analysis, ROI |
| 🖼️ **Thư viện ảnh** | Upload, AI query, tạo tiêu đề AI |
| 📝 **Ghi chú** | Sticky notes với màu sắc, tìm kiếm |
| 🌍 **Multi-site** | Quản lý nhiều WordPress site |
| 🔄 **SSE realtime** | Category tự cập nhật khi fetch từ WP xong |
| 👥 **User management** | Auth JWT, phân quyền admin/dev/sale |

---

## 🚀 Cài đặt nhanh

### Yêu cầu
- Node.js 18+
- API key: [Gemini](https://aistudio.google.com/) (bắt buộc)

### 1. Clone & cài
```bash
git clone https://github.com/ThienObito/ThinksmartPost.git
cd ThinksmartPost
npm install
```

### 2. Cấu hình (.env)
```bash
cp .env.example .env
# Sửa .env với API keys của bạn
```

### 3. Chạy
```bash
# Build CSS (nếu chỉnh sửa src/style.css)
npm run build:css

# Start server
PORT=4002 node server.js
```

Mở trình duyệt → `http://localhost:4002`

---

## ⚙️ Biến môi trường

| Variable | Required | Mô tả |
|----------|----------|-------|
| `GEMINI_API_KEY` | ✅ | API key từ Google AI Studio |
| `WP_URL` | ✅ | URL WordPress site (VD: https://thinksmart.vn) |
| `WP_APP_PASSWORD` | ✅ | Application Password từ WordPress |
| `WP_USERNAME` | ❌ | Username WP (mặc định: admin) |
| `JWT_SECRET` | ❌ | Secret cho JWT (tự sinh nếu để trống) |
| `PORT` | ❌ | Cổng server (mặc định: 4001, khuyên dùng 4002) |

---

## 🗂️ Cấu trúc thư mục

```
├── server.js              # Express server (routes, middleware)
├── api/                   # Route handlers
│   ├── auth.js            # JWT login/register
│   ├── admin.js           # User management
│   ├── create-article.js  # Tạo bài viết AI (Gemini)
│   ├── suggest-topics.js  # Gợi ý chủ đề
│   ├── templates.js       # CRUD template + AI suggest
│   ├── queue.js           # Publish queue
│   ├── library.js         # Media library CRUD + AI query
│   ├── analytics.js       # Google Analytics/GSC integration
│   ├── schedule-posts.js  # Scheduling system
│   ├── sites.js           # Multi-site management
│   ├── notes.js           # Sticky notes
│   ├── report.js          # Reporting
│   └── chat.js            # AI assistant chat
├── public/
│   ├── index.html         # SPA chính
│   ├── dist/style.css     # CSS đã build
│   ├── src/style.css      # Source CSS (Tailwind v4)
│   └── js/app.js          # Frontend JS (QTP namespace)
├── data/                  # JSON data files
├── utils/
│   ├── index.js           # Shared utilities
│   ├── ai-client.js       # Gemini API wrapper
│   └── rag.js             # RAG knowledge base
└── middleware/auth.js      # JWT middleware
```

---

## 🔌 API Endpoints

### Auth
```http
POST /api/auth/login     # {username, password} → token
POST /api/auth/register  # {username, password, fullName}
GET  /api/auth/me        # Current user info
```

### Articles
```http
GET    /api/articles               # Danh sách
GET    /api/articles/:filename     # Chi tiết
PUT    /api/articles/:filename     # Cập nhật
DELETE /api/articles/:filename     # Xóa
POST   /api/create-article         # Tạo bài (Gemini)
POST   /api/suggest-topics         # Gợi ý chủ đề
POST   /api/post-all               # Đăng hàng loạt lên WP
```

### WordPress
```http
GET    /api/wp-posts               # Bài viết trên WP
GET    /api/wp-categories          # Danh mục WP
PUT    /api/wp-posts/:id           # Cập nhật bài WP
DELETE /api/wp-posts/:id           # Xóa bài WP
```

### Templates
```http
GET    /api/templates              # Danh sách
POST   /api/templates              # Tạo mới
PUT    /api/templates/:id          # Cập nhật
DELETE /api/templates/:id          # Xóa
POST   /api/templates/duplicate/:id
POST   /api/templates/suggest      # AI suggest template
```

### Media & Library
```http
GET    /api/library/images?folderId=&limit=
POST   /api/library/images/upload  # Upload file
POST   /api/library/images/upload-url
POST   /api/library/ai-query       # AI search ảnh
POST   /api/media/generate-title   # AI tạo tiêu đề ảnh
POST   /api/media/generate-titles-batch
```

### Analytics
```http
GET /api/analytics/performance?period=30
GET /api/analytics/keywords?period=30
GET /api/analytics/gap?period=30
GET /api/analytics/roi?period=30
```

### Real-time
```http
GET /api/events/categories  # SSE — category updates
GET /api/rag/search?q=      # RAG knowledge base
```

---

## 🎨 Frontend

- **Single Page Application** — 1 file HTML (`index.html`) + CSS + JS
- **Namespace**: `QTP.*` (QTP.Auth, QTP.App, QTP.Articles, QTP.Templates...)
- **CSS**: Custom design system ("Midnight Command Center")
  - Font: Outfit (heading) + DM Sans (body) + Fira Code (mono)
  - Accent: Electric Orange (#ff6b2c) + Cyan + Violet + Emerald
  - Glassmorphism, 3-section accent borders, aurora background
  - Fully responsive (480px → 768px → 1024px → 1200px)
- **Icons**: Font Awesome 6
- **Charts**: Chart.js
- **Auth**: JWT token auto-refresh (ensureToken)

---

## 📦 Deploy

Xem [DEPLOY.md](DEPLOY.md) cho Docker, PM2, Nginx, Railway.

### Nhanh nhất (PM2)
```bash
npm install -g pm2
npm run build:css
PORT=4002 pm2 start server.js --name QTPosterPro
pm2 save && pm2 startup
```

---

## 🆘 Troubleshooting

| Vấn đề | Giải pháp |
|--------|-----------|
| Giao diện trắng | Hard refresh Ctrl+Shift+R; kiểm tra cache |
| CSS lỗi line numbers | `npm run build:css` — rebuild từ source |
| API 401 | Token hết hạn → tự động relogin (admin/admin123) |
| WordPress lỗi | Kiểm tra Application Password trong .env |
| Gemini lỗi | Kiểm tra GEMINI_API_KEY, quota |
