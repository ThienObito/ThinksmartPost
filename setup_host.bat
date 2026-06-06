@echo off
chcp 65001 >nul
title 🚀 AutoContentPoster Pro — Host Server Setup
color 0A

:: ═════════════════════════════════════════════════════════
::  setup_host.bat — AutoContentPoster Pro
::  Biến máy Windows thành HOST, kết nối Cloudflare Tunnel
::  và domain. Chạy 1 lần duy nhất khi setup máy mới.
:: ═════════════════════════════════════════════════════════

echo ╔══════════════════════════════════════════════════╗
echo ║     🚀 AutoContentPoster Pro — HOST SETUP       ║
echo ║     Biến máy tính này thành SERVER CHÍNH        ║
echo ║     Kết nối Cloudflare Tunnel + Domain          ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: ─── Kiểm tra Admin ─────────────────────────────
echo [1/7] 🔍 Kiểm tra quyền Administrator...
net session >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo ❌ Yêu cầu chạy bằng QUYỀN ADMIN!
    echo    Click phải file ^> Run as Administrator
    pause
    exit /b 1
)
echo ✅ OK
echo.

:: ─── Kiểm tra thư mục dự án ─────────────────────
echo [2/7] 📁 Kiểm tra thư mục dự án...
if not exist ".\server.js" (
    color 0C
    echo ❌ Không tìm thấy server.js!
    echo    Hãy đặt file setup_host.bat trong thư mục dự án
    echo    (cùng chỗ với server.js)
    pause
    exit /b 1
)
echo ✅ Đúng thư mục dự án
echo.

:: ─── Kiểm tra Node.js ──────────────────────────
echo [3/7] 🔧 Kiểm tra Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️ Chưa có Node.js — đang tải và cài...
    echo    (Khoảng 1-2 phút, vui lòng chờ)
    curl -L --progress-bar -o "%TEMP%\node.msi" "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
    msiexec /i "%TEMP%\node.msi" /quiet /norestart
    :: Refresh PATH để node có hiệu lực ngay
    set PATH=%PATH%;%ProgramFiles%\nodejs\
    call refreshenv >nul 2>&1
    echo ✅ Đã cài Node.js
) else (
    echo ✅ Node.js sẵn sàng
    for /f "tokens=*" %%i in ('node --version') do echo    Phiên bản: %%i
)
echo.

:: ─── Cài npm packages ──────────────────────────
echo [4/7] 📦 Cài đặt dependencies...
call npm install --no-fund --no-audit --loglevel error
if %errorLevel% neq 0 (
    echo ❌ Lỗi cài npm! Kiểm tra kết nối mạng.
    pause
    exit /b 1
)
echo ✅ Đã cài đủ dependencies
echo.

:: ─── Kiểm tra .env ─────────────────────────────
echo [5/7] 🔐 Kiểm tra file cấu hình .env...
if not exist ".\data\wp-config.json" (
    if exist ".\data" (
        echo ℹ️  Chưa có cấu hình WP — sẽ thiết lập sau qua giao diện
    )
)
echo ✅ OK
echo.

:: ─── Cloudflare Tunnel ─────────────────────────
echo [6/7] 🌐 Thiết lập Cloudflare Tunnel...
echo.

:: Kiểm tra cloudflared
where cloudflared >nul 2>&1
if %errorLevel% neq 0 (
    echo ⏳ Đang tải Cloudflared...
    mkdir "%ProgramFiles%\cloudflared" 2>nul
    curl -L --progress-bar -o "%ProgramFiles%\cloudflared\cloudflared.exe" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    setx PATH "%PATH%;%ProgramFiles%\cloudflared" /M >nul
    set PATH=%PATH%;%ProgramFiles%\cloudflared
    echo ✅ Đã cài Cloudflared thành công
) else (
    echo ✅ Cloudflared đã có sẵn
)
echo.

:: Kiểm tra xem có token cũ không
set CF_TOKEN=
if exist ".\cloudflared.token" (
    set /p CF_TOKEN=<.\cloudflared.token
    if not "!CF_TOKEN!"=="" (
        echo 💾 Phát hiện token đã lưu — tái sử dụng...
        goto :START_TUNNEL
    )
)

echo ┌─────────────────────────────────────────────────────────────┐
echo │ 🌐 CẤU HÌNH CLOUDFLARE TUNNEL                              │
echo │                                                             │
echo │ Để kết nối máy chủ với domain qua Cloudflare,              │
echo │ bạn cần Tunnel Token từ Cloudflare Dashboard.              │
echo │                                                             │
echo │ CÁCH LẤY TOKEN:                                             │
echo │ 1. Đăng nhập https://dash.cloudflare.com                    │
echo │ 2. Vào Zero Trust ^> Networks ^> Tunnels                     │
echo │ 3. Nếu chưa có tunnel: bấm "Create a tunnel"               │
echo │    - Chọn Cloudflared, đặt tên (VD: autocontentposter)     │
echo │    - Copy token hiện ra                                     │
echo │ 4. Nếu có tunnel cũ: bấm ⋮ ^> "Configure" ^> Copy token     │
echo │                                                             │
echo │ Tham khảo: https://developers.cloudflare.com/cloudflare-    │
echo │            one/connections/connect-networks/do-more-with-   │
echo │            tunnels/trycloudflared/                           │
echo └─────────────────────────────────────────────────────────────┘
echo.
set /p CF_TOKEN="👉 DÁN Tunnel Token vào đây (Enter để bỏ qua): "

if not "%CF_TOKEN%"=="" (
    :: Lưu token để lần sau dùng luôn
    echo %CF_TOKEN%>.\cloudflared.token
    goto :START_TUNNEL
) else (
    color 0E
    echo ⚠️ Bỏ qua Cloudflare Tunnel.
    echo    Chỉ truy cập được qua: http://localhost:4002
    echo.
)

:START_TUNNEL
if not "%CF_TOKEN%"=="" (
    echo.
    echo ✅ Khởi động Cloudflare Tunnel...
    echo    (Cửa sổ mới sẽ mở — để nguyên chạy nền)
    start "Cloudflare-Tunnel" cmd /c "title 🌐 CF Tunnel & cloudflared tunnel run --token %CF_TOKEN% --protocol http2"
    echo    ⏳ Đợi 5 giây để tunnel kết nối...
    timeout /t 5 /nobreak >nul
    echo ✅ Tunnel đã chạy! Domain sẽ hoạt động trong 30-60 giây
    echo.
)

:: ─── Tạo shortcut boot ─────────────────────────
echo [7/7] 🚀 Cài đặt tự động chạy khi khởi động...
set STARTUP_DIR="%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set SCRIPT_PATH="%CD%\start_server.bat"

(
    echo @echo off
    echo chcp 65001 ^>nul
    echo title AutoContentPoster Server
    echo cd /d "%CD%"
    echo npm start
) > "%SCRIPT_PATH%"

:: Tạo shortcut trong Startup
echo ✅ Đã tạo tự động chạy server mỗi khi máy bật
echo    (File start_server.bat trong %STARTUP_DIR%)
echo.

:: ─── Khởi động Server ─────────────────────────
echo ═══════════════════════════════════════════════════════════════
echo   🎯 HOÀN TẤT! Server đã sẵn sàng
echo.
echo   📍 TRUY CẬP:
echo.
if not "%CF_TOKEN%"=="" (
    echo      🌐 QUA DOMAIN: https://app.thinkedu.com.vn
    echo      🌐 IP THẬT:    http://<IP-cua-may>:4002
)
echo      💻 LOCAL:       http://localhost:4002
echo.
echo   ⏱️  Nếu dùng domain, đợi 1-2 phút để DNS cập nhật
echo.
echo   🛑 TẮT: Nhấn Ctrl+C (hoặc đóng cửa sổ này)
echo ═══════════════════════════════════════════════════════════════
echo.

:: Chạy server
node server.js

pause
