# QTPosterPro

**Công cụ tự động tạo và đăng bài SEO lên WordPress bằng AI**

Một công cụ mạnh mẽ giúp tự động tạo bài viết SEO chất lượng cao bằng DeepSeek + Flux, sau đó đăng trực tiếp lên WordPress.

---

## ✨ Tính năng chính

- Tạo bài viết SEO tiếng Việt chất lượng cao (1800-2500 từ)
- Tích hợp AI DeepSeek Chat
- Tạo ảnh minh họa bằng Flux Schnell (Replicate)
- Quản lý bài viết local
- Đăng bài hàng loạt lên WordPress
- Xem, sửa, xóa bài viết trực tiếp trên WP
- Gợi ý chủ đề thông minh
- Giao diện hiện đại, dễ sử dụng

---

## 🚀 Hướng dẫn cài đặt & sử dụng

### 1. Cài đặt

```bash
# Clone project
git clone https://github.com/ThienObito/ThinksmartPost.git
cd ThinksmartPost

# Cài dependencies
npm install

Công cụ tự động tạo bài viết SEO chất lượng cao bằng AI và đăng lên WordPress.

## Tính năng

- 🤖 **AI Content Writing** — Dùng DeepSeek API viết bài blog chuẩn SEO (1800-2500 từ)
- 🖼️ **AI Image Generation** — Tạo ảnh minh hoạ bằng Flux Schnell (Replicate)
- 📦 **Quản lý bài viết** — Dashboard quản lý bài viết đã tạo
- 🌐 **WordPress Integration** — Đăng bài trực tiếp lên WordPress qua REST API
- 📋 **Gợi ý chủ đề** — AI gợi ý chủ đề hot cho content marketing
- ⚙️ **Tùy chỉnh Prompt** — Custom prompt viết bài & tạo ảnh

## Cài đặt

```bash
# Clone & install
npm install

# Copy env và điền API keys
cp .env.example .env

# Chạy
npm start
# hoặc
node server.js
```

## Biến môi trường (.env)

| Variable | Bắt buộc | Mô tả |
|----------|----------|-------|
| `DEEPSEEK_API_KEY` | ✅ | API key từ DeepSeek |
| `REPLICATE_API_TOKEN` | ❌ | Token từ Replicate (để tạo ảnh) |
| `WP_URL` | ✅ | URL WordPress site |
| `WP_USERNAME` | ❌ | Username WP (mặc định: admin) |
| `WP_APP_PASSWORD` | ✅ | Application Password từ WordPress |
| `PORT` | ❌ | Cổng server (mặc định: 4001) |

## API Endpoints

### Tạo bài viết
```bash
POST /api/create-article
Body: { "topics": ["Chủ đề 1", "Chủ đề 2"], "category": "giai-phap" }
```

### Gợi ý chủ đề
```bash
POST /api/suggest-topics
Body: { "category": "giai-phap" }
```

### Quản lý bài viết local
```
GET    /api/articles              # Danh sách bài viết
DELETE /api/articles/:filename    # Xóa bài viết
```

### WordPress
```
POST   /api/post-all              # Đăng hàng loạt lên WP
GET    /api/wp-posts              # Danh sách bài viết trên WP
DELETE /api/wp-posts/:id          # Xóa bài viết trên WP
PUT    /api/wp-posts/:id          # Cập nhật bài viết trên WP
GET    /api/wp-categories         # Danh sách chuyên mục
```

## Cấu trúc thư mục

```
├── server.js           # Express server chính
├── api/
│   ├── create-article.js   # Handler tạo bài viết
│   └── suggest-topics.js   # Handler gợi ý chủ đề
├── public/
│   ├── index.html      # Dashboard UI
│   ├── script.js       # Frontend logic
│   └── style.css       # Styles
├── data/               # Bài viết đã tạo (JSON)
├── .env                # Environment variables
└── package.json
```

## Cách lấy WordPress Application Password

1. Vào WordPress Dashboard → Users → Profile
2. Kéo xuống "Application Passwords"
3. Nhập tên (vd: "AutoContentPoster") → Generate
4. Copy password dạng `xxxx xxxx xxxx xxxx xxxx`
5. Dán vào `WP_APP_PASSWORD` trong `.env`

## License

MIT
