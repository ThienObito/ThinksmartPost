# Setup Host Server (Windows)

## Cách 1: Chạy lần đầu (setup đầy đủ)
Gấp đôi click vào **`setup_host.bat** — nó sẽ tự động:

1. Kiểm tra quyền Admin
2. Cài Node.js (nếu chưa có)
3. Chạy `npm install`
4. Cài Cloudflared (nếu chưa có)
5. Nhắc dán Tunnel Token → kết nối Cloudflare
6. Tạo auto-start khi khởi động Windows
7. Khởi động server

## Cách 2: Chạy lại sau khi đã setup
Gấp đôi click vào **`start_server.bat`** — chỉ khởi động server nhanh.

## Cách lấy Cloudflare Tunnel Token

1. Vào **https://dash.cloudflare.com**
2. Zero Trust → Networks → Tunnels
3. Tạo tunnel mới (tên: `autocontentposter`)
4. Copy token (dạng `eyJ...`)
5. Dán vào `setup_host.bat` khi được hỏi

## Yêu cầu
- Windows 10/11
- Internet
- Quyền Admin (khi chạy lần đầu)
