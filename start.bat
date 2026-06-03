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

:: ── Set git identity (tranh loi) ──────────────────────────────
git config user.email "thinksmart@example.com" >nul 2>&1

:: ── Cap nhat code ────────────────────────────────────────────
echo [1/3] Cap nhat code tu GitHub...
git pull
if %errorlevel% neq 0 (
    echo [!] Git pull that bai. Kiem tra ket noi mang hoac Git.
    pause
    exit /b 1
)
echo.

:: ── Kill server cu (neu dang chay) ──────────────────────────
echo [2/3] Tat server cu tren port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo     OK
echo.

:: ── Mo server o cua so rieng ────────────────────────────────
echo [3/3] Khoi dong server...
start "ThinksmartServer" /MIN cmd /c "cd /d %PROJECT_DIR% && echo. && echo  Server dang chay o http://localhost:%PORT% && echo  Tat cua so nay de dung server && echo. && node server.js"
echo     Server dang chay trong cua so rieng.
timeout /t 3 /nobreak >nul

:: ── Mo Edge ──────────────────────────────────────────────────
echo Mo trinh duyet...
start msedge "http://localhost:%PORT%"

echo.
echo ============================================
echo    Xong! Server chay o cua so rieng.
echo    Tat cua so server = dung app.
echo    Cua so nay co the tat.
echo ============================================
echo.
pause
