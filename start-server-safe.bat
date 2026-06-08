@echo off
title AutoContentPoster Pro - Server
color 0A

set PROJECT_DIR=C:\Users\Thinksmart\Desktop\ThinksmartPost
set PORT=4002
set LOG_FILE=%PROJECT_DIR%\logs\server.log

if not exist "%PROJECT_DIR%\logs" mkdir "%PROJECT_DIR%\logs"
echo [%date% %time%] Server starting >> "%LOG_FILE%"

echo.
echo ??????????????????????????????????????????????????
echo ?   AutoContentPoster Pro - Auto Start           ?
echo ??????????????????????????????????????????????????
echo.

echo [..] Waiting for network...
:wait_network
ping -n 1 8.8.8.8 >nul 2>&1
if errorlevel 1 (
    timeout /t 3 /nobreak >nul
    goto wait_network
)
echo [OK] Network ready

echo [..] Waiting for Cloudflare tunnel...
:wait_tunnel
sc query cloudflared | findstr "RUNNING" >nul 2>&1
if errorlevel 1 (
    net start cloudflared >nul 2>&1
    timeout /t 3 /nobreak >nul
    goto wait_tunnel
)
echo [OK] Cloudflare tunnel running

echo [..] Checking port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [OK] Port %PORT% ready

cd /d "%PROJECT_DIR%"

echo [..] Starting auto-deploy monitor...
echo [OK] Deploy monitor ready (every 2 minutes)
echo.

:deploy_loop
start /b "" call "%PROJECT_DIR%\deploy-safe.bat" >nul 2>&1

echo [%time%] Starting server on port %PORT%...
node server.js

echo [!!] Server crashed at %time%. Restarting in 10s...
echo [%date% %time%] Server crashed >> "%LOG_FILE%"
timeout /t 10 /nobreak >nul
goto deploy_loop
