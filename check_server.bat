@echo off
chcp 65001 >nul
title AutoContentPoster — Server Health Check
color 0A
echo ═══════════════════════════════════════════════
echo   🩺 AutoContentPoster Pro — Health Check
echo ═══════════════════════════════════════════════
echo.

:: Kiểm tra localhost
echo [1/3] 🔍 Kiểm tra localhost...
curl -s -o nul -w "HTTP %{http_code}\n" http://localhost:4002/ 2>nul
if %errorLevel% neq 0 (
    color 0C
    echo ❌ Server chưa chạy!
    echo    Chạy: start_server.bat
) else (
    echo ✅ Server OK
)
echo.

:: Kiểm tra Cloudflare Tunnel service
echo [2/3] 🚇 Kiểm tra Cloudflare Tunnel...
sc query "Cloudflare Tunnel" >nul 2>&1
if %errorLevel% equ 0 (
    echo ✅ Tunnel service đang chạy
) else (
    echo ⚠️ Tunnel chưa cài hoặc chưa chạy
    echo    Chạy: cloudflared service install <token>
)
echo.

:: Kiểm tra domain
echo [3/3] 🌐 Kiểm tra domain...
curl -s -o nul -w "HTTP %{http_code}\n" "https://app.thinkedu.com.vn/" 2>nul
if %errorLevel% neq 0 (
    color 0E
    echo ⚠️ Domain chưa phản hồi (có thể DNS chưa cập nhật)
) else (
    echo ✅ Domain OK
)
echo.

echo ═══════════════════════════════════════════════
pause
