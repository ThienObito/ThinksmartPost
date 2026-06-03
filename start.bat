@echo off
chcp 65001 >nul
title ThinksmartPost - Auto Start

:: ── Đường dẫn project ──────────────────────────────────────────
set "PROJECT_DIR=C:\Users\Thinksmart\Desktop\ThinksmartPost"
set "PORT=4002"

echo ============================================
echo    ThinksmartPost - Auto Start
echo ============================================
echo.

:: ── Vào thư mục project ──────────────────────────────────────
cd /d "%PROJECT_DIR%"
if %errorlevel% neq 0 (
    echo [!] Khong tim thay thu muc: %PROJECT_DIR%
    pause
    exit /b 1
)
echo [1/3] Cap nhat code tu GitHub...
git config user.email "thinksmart@example.com" >nul 2>&1
git pull
if %errorlevel% neq 0 (
    echo [!] Git pull that bai. Kiem tra ket noi mang hoac Git.
    pause
    exit /b 1
)
echo.

:: ── Kill server cu (neu dang chay) ──────────────────────────
echo [2/3] Kill server cu tren port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
    set "PID=%%a"
    goto :kill
)
:kill
if defined PID (
    taskkill /f /pid %PID% >nul 2>&1
    echo     Da kill process PID %PID%
) else (
    echo     Khong co server nao chay tren port %PORT%
)
timeout /t 2 /nobreak >nul

:: ── Chay server ──────────────────────────────────────────────
echo.
echo [3/3] Khoi dong server...
start "ThinksmartServer" cmd /c "node server.js"
echo     Dang cho server khoi dong...
timeout /t 5 /nobreak >nul

:: ── Mo trinh duyet Edge ──────────────────────────────────────
echo.
echo Mo trinh duyet Edge: http://localhost:%PORT%
start msedge "http://localhost:%PORT%"

echo.
echo ============================================
echo    Hoan tat! Server dang chay.
echo    Neu khong mo duoc, vao: http://localhost:%PORT%
echo ============================================
echo.
pause
