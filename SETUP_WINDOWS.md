# Setup Windows Server (Chạy 1 lần, tự động mãi mãi)

## Bước 1: Cài đặt lần đầu

1. Mở thư mục dự án (có chứa `server.js`)
2. **Chuột phải** vào `setup_server.bat` → **Run as Administrator**
3. Script sẽ tự động:
   - Cài Node.js (nếu chưa có)
   - Chạy `npm install`
   - Cài Cloudflared (nếu chưa có)
   - Hỏi Tunnel Token → nhập → cài làm Windows Service
   - Tạo Scheduled Task để server tự chạy khi boot
   - Khởi động server ngay lập tức

## Bước 2: Lấy Tunnel Token

Khi script hỏi token, vào:
**https://dash.cloudflare.com** → **Zero Trust** → **Networks** → **Tunnels**
→ **Create a tunnel** (tên: `thinkedu`) → Copy token (eyJ...) → Dán vào script

## Sau khi setup xong

| Việc | Tự động chạy khi bật máy? |
|---|---|
| 🌐 Cloudflare Tunnel | ✅ Có (Windows Service) |
| 🖥️ Node.js Server | ✅ Có (Scheduled Task) |

Chỉ cần bật máy, mở trình duyệt vào `https://app.thinkedu.com.vn` là dùng được!

## File đi kèm

| File | Chức năng |
|---|---|
| `setup_server.bat` | Cài đặt lần đầu (chạy 1 lần) |
| `start_server.bat` | Khởi động server thủ công |
| `check_server.bat` | Kiểm tra tình trạng server + tunnel |

## Troubleshooting

### Server không chạy
- Chạy `check_server.bat` để kiểm tra
- Hoặc chạy `start_server.bat` thủ công

### Lỗi "git pull" (Lock file)
```bash
git gc --prune=now
git pull origin main
```

### Cần update code mới
```bash
git pull origin main
# Rồi restart server (hoặc reboot máy)
```
