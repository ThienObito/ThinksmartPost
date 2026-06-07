@echo off
chcp 65001 >nul
title setup_server.bat — AutoContentPoster Pro
color 0A

:: ═══════════════════════════════════════════════════════════════
::  setup_server.bat — AutoContentPoster Pro
::  Dành cho máy PHỤ (Windows).
::  Chạy 1 LẦN DUY NHẤT để setup. Sau đó mỗi khi bật máy,
::  server + tunnel tự chạy, vào web là dùng được ngay.
:: ═══════════════════════════════════════════════════════════════

set VERSION=1.0
set PROJECT_DIR=%CD%
set DOMAIN=https://app.thinkedu.com.vn
set PORT=4002
set TOKEN_FILE=%PROJECT_DIR%\cloudflared.token

:: ─── 1. Kiểm tra Admin ────────────────────────────────────────
title setup_server.bat [1/7] — Kiểm tra Admin
echo ╔═══════════════════════════════════════════════════════════╗
echo ║   AutoContentPoster Pro — SETUP SERVER (Windows)        ║
echo ║   Chạy 1 lần → Tự động chạy mãi mãi                     ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

echo [1/7] 🔍 Kiểm tra quyền Administrator...
net session >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo ❌ Vui lòng chuột phải file .bat → "Run as Administrator"
    pause
    exit /b 1
)
echo ✅ OK
echo.

:: ─── 2. Kiểm tra thư mục ─────────────────────────────────────
title setup_server.bat [2/7] — Kiểm tra thư mục
echo [2/7] 📁 Kiểm tra thư mục dự án...
if not exist "%PROJECT_DIR%\server.js" (
    color 0C
    echo ❌ Đặt file này trong thư mục chứa server.js
    pause
    exit /b 1
)
echo ✅ Đúng thư mục: %PROJECT_DIR%
echo.

:: ─── 3. Kiểm tra / Cài Node.js ───────────────────────────────
title setup_server.bat [3/7] — Cài Node.js
echo [3/7] 🔧 Kiểm tra Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo ⏳ Đang tải Node.js LTS...
    curl -L -# -o "%TEMP%\node.msi" "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
    echo 📦 Đang cài Node.js (chờ 1-2 phút)...
    msiexec /i "%TEMP%\node.msi" /quiet /norestart
    set PATH=%PATH%;%ProgramFiles%\nodejs\
    echo ✅ Đã cài xong
) else (
    for /f "tokens=*" %%v in ('node --version') do echo ✅ Node.js: %%v
)
echo.

:: ─── 4. Cài npm packages ─────────────────────────────────────
title setup_server.bat [4/7] — npm install
echo [4/7] 📦 Cài đặt npm packages...
cd /d "%PROJECT_DIR%"
call npm install --no-fund --no-audit --loglevel error
if %errorLevel% neq 0 (
    echo ❌ Lỗi npm install. Kiểm tra mạng!
    pause
    exit /b 1
)
echo ✅ npm packages OK
echo.

:: ─── 5. Cài Cloudflared + Tunnel ─────────────────────────────
title setup_server.bat [5/7] — Cloudflare Tunnel
echo [5/7] 🌐 Thiết lập Cloudflare Tunnel...
echo.

:: Cài cloudflared nếu chưa có
where cloudflared >nul 2>&1
if %errorLevel% neq 0 (
    echo ⏳ Đang tải Cloudflared...
    mkdir "%ProgramFiles%\cloudflared" 2>nul
    curl -L -# -o "%ProgramFiles%\cloudflared\cloudflared.exe" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    setx PATH "%PATH%;%ProgramFiles%\cloudflared" /M >nul
    echo ✅ Đã cài Cloudflared
) else (
    echo ✅ Cloudflared đã cài
)
echo.

:: Hỏi token
set CF_TOKEN=
if exist "%TOKEN_FILE%" (
    set /p CF_TOKEN=<"%TOKEN_FILE%"
    if not "!CF_TOKEN!"=="" (
        echo 💾 Đã tìm thấy token cũ.
        goto :INSTALL_TUNNEL
    )
)

echo ┌──────────────────────────────────────────────────────────┐
echo │ 🌐 CẦN CLOUDFLARE TUNNEL TOKEN                           │
echo │                                                          │
echo │ Vào https://dash.cloudflare.com → Zero Trust             │
echo │ → Networks → Tunnels → Create a tunnel                   │
echo │ → Chọn Cloudflared, đặt tên "thinkedu"                  │
echo │ → Copy token (dạng eyJ...), dán bên dưới               │
echo └──────────────────────────────────────────────────────────┘
echo.
set /p CF_TOKEN="👉 Dán Tunnel Token (Enter để bỏ qua): "
if not "%CF_TOKEN%"=="" (
    echo %CF_TOKEN%>"%TOKEN_FILE%"
    goto :INSTALL_TUNNEL
) else (
    echo ⚠️ Bỏ qua tunnel. Chỉ truy cập http://localhost:%PORT%
    goto :SETUP_TASK
)

:INSTALL_TUNNEL
echo.
echo 🚇 Cài Cloudflare Tunnel làm Windows Service...
cloudflared service install "%CF_TOKEN%" >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️ Tunnel đã cài trước đó hoặc lỗi nhẹ — bỏ qua
) else (
    echo ✅ Tunnel service installed!
)
echo ✅ Tunnel sẽ tự chạy mỗi khi máy bật
echo.
goto :SETUP_TASK

:: ─── 6. Tạo Scheduled Task cho Server ────────────────────────
:SETUP_TASK
title setup_server.bat [6/7] — Tự động chạy Server
echo [6/7] 🚀 Cài đặt auto-start cho server...
echo.

set TASK_NAME=AutoContentPosterServer
set NODE_EXE=node
set SERVER_JS=%PROJECT_DIR%\server.js

:: Kiểm tra task đã tồn tại chưa, nếu có thì xóa tạo lại
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorLevel% equ 0 (
    schtasks /delete /tn "%TASK_NAME%" /f >nul
)

:: Tạo task chạy khi máy bật (với quyền cao nhất)
schtasks /create /tn "%TASK_NAME%" /ru SYSTEM /rl HIGHEST ^
    /tr "cmd /c cd /d \"%PROJECT_DIR%\" && node server.js" ^
    /sc onstart /delay 0000:30 /f >nul

if %errorLevel% neq 0 (
    :: Fallback: startup folder
    echo ⚠️ Không tạo được Scheduled Task — dùng Startup Folder
    set STARTUP_SHORTCUT="%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\start_server.bat"
    (
        echo @echo off
        echo chcp 65001 ^>nul
        echo cd /d "%PROJECT_DIR%"
        echo node server.js
    ) > %STARTUP_SHORTCUT%
    echo ✅ Đã tạo file trong Startup folder
) else (
    echo ✅ Scheduled Task đã tạo!
    echo    Server tự chạy 30 giây sau khi Windows boot
)
echo.

:: ─── 7. Hoàn tất + Chạy ──────────────────────────────────────
title setup_server.bat [7/7] — Hoàn tất! 🎉
echo [7/7] 🎉 HOÀN TẤT!
echo.
echo ════════════════════════════════════════════════════════════╗
echo   🚀 AutoContentPoster Pro đã sẵn sàng!
echo ════════════════════════════════════════════════════════════╝
echo.
echo   📍 TRUY CẬP:
if not "%CF_TOKEN%"=="" (
    echo      🌐 QUA DOMAIN: %DOMAIN%
)
echo      💻 LOCAL:   http://localhost:%PORT%
echo.
echo   🟢 SAU NÀY: Chỉ cần bật máy là tự chạy!
if not "%CF_TOKEN%"=="" (
    echo      - Cloudflare Tunnel: tự động (Windows Service)
)
echo      - Node.js Server: tự động (Scheduled Task)
echo.
echo   🔴 ĐỂ KIỂM TRA SỰ CỐ: chạy file check_server.bat
echo.
echo ════════════════════════════════════════════════════════════
echo.

:: Chạy server ngay lập tức
echo 🚀 Khởi động server ngay...
start "AutoContentPoster-Server" cmd /c "title QTPosterPro Server & node server.js"
echo ✅ Server đã chạy! Mở trình duyệt http://localhost:%PORT%
echo.
echo ⏳ Nếu dùng domain, đợi 30-60s cho DNS cập nhật
echo    Nhấn Enter để kiểm tra...
pause >nul
start "" "%DOMAIN%"
exit /b 0
