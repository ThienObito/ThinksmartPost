@echo off
chcp 65001 >nul
title AutoContentPoster Server
cd /d "%~dp0"
echo 🚀 AutoContentPoster Pro — Server
echo.
node server.js

if %errorlevel% neq 0 (
    echo.
    echo ❌ Server đã dừng với lỗi. Kiểm tra log ở trên.
    echo    Nếu thiếu npm packages, chạy: npm install
    pause
)
