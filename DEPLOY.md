# 🚀 Hướng dẫn Deploy QTPosterPro

## Yêu cầu
- Node.js 18+ (khuyên dùng 22)
- Docker (tùy chọn)
- API Key Gemini từ [Google AI Studio](https://aistudio.google.com/)

---

## 📦 CÁCH 1: Docker

### 1. Build & chạy
```bash
cd ~/AI_thinksmart/AutoContentPoster

# Tạo file .env.production
cat > .env.production << EOF
GEMINI_API_KEY=AIzaXXXX
WP_APP_PASSWORD="xxxx xxxx"
WP_URL=https://thinksmart.vn
WP_USERNAME=admin
JWT_SECRET=your-secret-here
PORT=4002
EOF

# Build & chạy
docker compose --env-file .env.production up -d --build
```

### 2. Kiểm tra
```bash
docker ps
docker logs qtposter-pro -f
curl http://localhost:4002/
```

### 3. Cập nhật
```bash
git pull
docker compose down
docker compose up -d --build
```

---

## 📦 CÁCH 2: PM2

### 1. Cài PM2
```bash
npm install -g pm2
```

### 2. Build CSS & chạy
```bash
cd ~/AI_thinksmart/AutoContentPoster

# Build CSS (nếu chỉnh src/style.css)
npm run build:css

# Chạy
PORT=4002 pm2 start server.js --name QTPosterPro
pm2 save
pm2 startup
```

### 3. Các lệnh PM2
```bash
pm2 status                    # Trạng thái
pm2 logs QTPosterPro          # Xem log
pm2 restart QTPosterPro       # Restart
pm2 stop QTPosterPro          # Dừng
```

---

## 📦 CÁCH 3: Nginx Reverse Proxy

### 1. Cấu hình Nginx
```nginx
# /etc/nginx/sites-available/qtposter
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 20M;
    }

    location /api/events/ {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/qtposter /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 2. SSL với Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 📦 CÁCH 4: Railway.app

1. **New Project** → **Deploy from GitHub repo**
2. **Build Settings**: `npm run build:css`
3. **Start Command**: `node server.js`
4. **Environment Variables**:
   | Variable | Value |
   |---|---|
   | `GEMINI_API_KEY` | AIzaXXXX |
   | `WP_APP_PASSWORD` | xxxx xxxx |
   | `WP_URL` | https://thinksmart.vn |
   | `WP_USERNAME` | admin |
   | `JWT_SECRET` | tự tạo ngẫu nhiên |
   | `NODE_ENV` | production |

> ⚠️ Railway dùng ephemeral filesystem → data mất khi restart.
> Dùng Volume mount cho `/app/data` và `/app/public/uploads`.

---

## 📁 File cần backup

| Đường dẫn | Mô tả |
|-----------|-------|
| `data/` | Articles, users, queue, templates, notes |
| `public/uploads/` | Ảnh đã upload |
| `.env` | API keys & secrets |

---

## 🔍 Kiểm tra sau deploy

```bash
# 1. App chạy?
curl http://localhost:4002/

# 2. CSS load?
curl -s -o /dev/null -w "%{http_code}" http://localhost:4002/dist/style.css?v=5.0.0

# 3. API hoạt động?
curl -X POST http://localhost:4002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 4. Articles?
TOKEN=$(curl -s -X POST http://localhost:4002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4002/api/stats
```

---

## 🆘 Xử lý sự cố

| Lỗi | Giải pháp |
|-----|-----------|
| `GEMINI_API_KEY missing` | Kiểm tra .env, set `GEMINI_API_KEY` |
| `Port 4002 already in use` | `kill $(lsof -ti:4002)` hoặc đổi `PORT` |
| CSS không load | Hard refresh Ctrl+Shift+R; kiểm tra `?v=` cache buster |
| `404 Cannot GET /api/...` | Kiểm tra route trong server.js |
| Docker permission denied | `sudo chown -R 1000:1000 data/` |
