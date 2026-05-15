# 🚀 Hướng dẫn Deploy QTPosterPro

## Yêu cầu
- Node.js 18+ (khuyên dùng 22)
- Docker (tùy chọn, khuyên dùng)
- Domain (tùy chọn)

---

## 📦 CÁCH 1: Docker (Khuyên dùng)

### 1. Build & chạy
```bash
cd ~/AI/ToolAI/AutoContentPoster

# Tạo file .env.production với các biến môi trường
cat > .env.production << EOF
DEEPSEEK_API_KEY=sk-xxxx
REPLICATE_API_TOKEN=r8_xxxx
WP_APP_PASSWORD=xxxx xxxx
WP_URL=https://thinksmart.vn
WP_USERNAME=admin
JWT_SECRET=$(openssl rand -hex 32)
EOF

# Chạy với Docker Compose
docker compose --env-file .env.production up -d --build
```

### 2. Kiểm tra
```bash
docker ps                     # Container đang chạy
docker logs qtposter-pro -f   # Xem log
curl http://localhost:4001/    # Web đã lên chưa
```

### 3. Dừng & cập nhật
```bash
docker compose down                    # Dừng
git pull                               # Pull code mới
docker compose up -d --build           # Build lại & chạy
```

---

## 📦 CÁCH 2: PM2 (Process Manager)

### 1. Cài PM2
```bash
npm install -g pm2
```

### 2. Build CSS & chạy
```bash
cd ~/AI/ToolAI/AutoContentPoster
npx tailwindcss --input public/src/style.css --output public/dist/style.css

# Tạo thư mục logs
mkdir -p logs

# Chạy với PM2
pm2 start ecosystem.config.js
pm2 save                     # Lưu process list
pm2 startup                  # Tự động start khi reboot
```

### 3. Các lệnh PM2
```bash
pm2 status                    # Trạng thái
pm2 logs QTPosterPro          # Xem log
pm2 restart QTPosterPro       # Restart
pm2 stop QTPosterPro          # Dừng
```

---

## 📦 CÁCH 3: VPS + Nginx Reverse Proxy

### 1. Cài & chạy app (PM2 hoặc Docker)
Chọn 1 trong 2 cách trên.

### 2. Cấu hình Nginx
```nginx
# /etc/nginx/sites-available/qtposter
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Giới hạn kích thước upload (cho ảnh)
        client_max_body_size 20M;
    }

    # Cache static files
    location /dist/ {
        proxy_pass http://127.0.0.1:4001;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/qtposter /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. SSL với Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## ☁️ CÁCH 4: Railway.app (PaaS - Dễ nhất)

### 1. Cấu hình
Tại [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**

### 2. Build Settings
```
Root Directory: (mặc định)
Build Command: npx tailwindcss --input public/src/style.css --output public/dist/style.css
Start Command: node server.js
```

### 3. Environment Variables (Railway Dashboard)
| Variable | Value |
|---|---|
| `DEEPSEEK_API_KEY` | sk-xxxx |
| `REPLICATE_API_TOKEN` | r8_xxxx |
| `WP_APP_PASSWORD` | xxxx xxxx |
| `WP_URL` | https://thinksmart.vn |
| `WP_USERNAME` | admin |
| `JWT_SECRET` | tự tạo chuỗi ngẫu nhiên |
| `NODE_ENV` | production |
| `PORT` | (Railway auto-set) |

> ⚠️ Railway dùng ephemeral filesystem → data sẽ mất khi restart.
> Cần dùng add-on Volume để mount `/app/data` và `/app/public/uploads`.

---

## 📁 File cần backup

| Đường dẫn | Mô tả |
|---|---|
| `data/` | Articles, users, queue, templates, notes |
| `public/uploads/` | Ảnh đã upload |
| `.env` | API keys & secrets |

---

## 🔍 Kiểm tra sau deploy

```bash
# 1. App chạy?
curl http://localhost:4001/

# 2. CSS load?
curl -I http://localhost:4001/dist/style.css

# 3. JS load?
curl http://localhost:4001/js/app.js | head -5

# 4. API hoạt động?
curl http://localhost:4001/api/stats
# → {"success":false,"message":"Vui lòng đăng nhập"} (OK, cần auth)

# 5. Tạo bài viết thử?
curl -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

---

## 🆘 Xử lý sự cố

| Lỗi | Giải pháp |
|---|---|
| `EACCES: permission denied` | `sudo chown -R $USER data/ public/uploads/` |
| `Cannot find module 'sharp'` | `npm rebuild sharp` |
| `401 DeepSeek API` | Kiểm tra `DEEPSEEK_API_KEY` trong `.env` |
| `Port 4001 already in use` | `kill $(lsof -ti:4001)` hoặc đổi `PORT` trong `.env` |
| Docker: `permission denied` | `docker compose down && sudo chown -R 1000:1000 data/` |
