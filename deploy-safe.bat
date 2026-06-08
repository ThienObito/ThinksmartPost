@echo off
REM ============================================================
REM AutoContentPoster Pro - Safe Auto-Deploy with Rollback
REM ============================================================

title AutoContentPoster Pro - Auto Deploy
color 0A

set PROJECT_DIR=C:\Users\Thinksmart\Desktop\ThinksmartPost
set PORT=4002
set LOG_FILE=%PROJECT_DIR%\logs\deploy.log
set BACKUP_DIR=%PROJECT_DIR%\.backups
set DEPLOY_TEST_DIR=%PROJECT_DIR%\.deploy-test

if not exist "%PROJECT_DIR%\logs" mkdir "%PROJECT_DIR%\logs"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo [%date% %time%] Deploy cycle started >> "%LOG_FILE%"

REM 1. CREATE .gitignore
echo.
echo [1/6] Setting up .gitignore...

(
    echo # Local configuration (DO NOT COMMIT)
    echo .env
    echo .env.local
    echo .env.*.local
    echo.
    echo # Cloudflare tunnel (LOCAL ONLY)
    echo .cloudflared/
    echo.
    echo # Deployment artifacts
    echo .backups/
    echo .deploy-test/
    echo.
    echo # Logs
    echo logs/
    echo *.log
    echo.
    echo # Dependencies
    echo node_modules/
    echo.
    echo # OS
    echo Thumbs.db
    echo .DS_Store
) > "%PROJECT_DIR%\.gitignore"

echo [OK] .gitignore created

REM 2. BACKUP
echo.
echo [2/6] Backing up current state...

set BACKUP_TIME=%date:~10,4%%date:~4,2%%date:~7,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_PATH=%BACKUP_DIR%\backup-%BACKUP_TIME%

mkdir "%BACKUP_PATH%"
xcopy "%PROJECT_DIR%\server.js" "%BACKUP_PATH%" /Y >nul 2>&1
xcopy "%PROJECT_DIR%\package.json" "%BACKUP_PATH%" /Y >nul 2>&1

echo [OK] Backup created

REM 3. FETCH & CHECK
echo.
echo [3/6] Checking for code changes...

cd /d "%PROJECT_DIR%"

git remote update >nul 2>&1
if errorlevel 1 goto :skip_update

for /f %%i in ('git rev-parse HEAD') do set LOCAL_COMMIT=%%i
for /f %%i in ('git rev-parse @{u}') do set REMOTE_COMMIT=%%i

if "%LOCAL_COMMIT%"=="%REMOTE_COMMIT%" (
    echo [OK] No changes. Code is up-to-date.
    goto :health_check
)

echo [!!] New code detected. Deploying...

REM 4. GIT PULL
echo.
echo [4/6] Pulling latest code...

git stash >nul 2>&1
git pull --ff-only origin main >nul 2>&1
if errorlevel 1 (
    git pull --ff-only origin master >nul 2>&1
    if errorlevel 1 (
        echo [!!] Git pull failed!
        git merge --abort >nul 2>&1
        goto :rollback
    )
)

echo [OK] Code pulled

REM 5. TEST
echo.
echo [5/6] Testing deployment...

if exist "%DEPLOY_TEST_DIR%" rmdir /s /q "%DEPLOY_TEST_DIR%" >nul 2>&1
mkdir "%DEPLOY_TEST_DIR%"

xcopy "%PROJECT_DIR%\*.js" "%DEPLOY_TEST_DIR%" /Y >nul 2>&1
xcopy "%PROJECT_DIR%\package.json" "%DEPLOY_TEST_DIR%" /Y >nul 2>&1

cd /d "%DEPLOY_TEST_DIR%"
call npm ci --production >nul 2>&1
if errorlevel 1 (
    echo [!!] npm install failed!
    cd /d "%PROJECT_DIR%"
    goto :rollback
)

for %%f in (*.js) do (
    node -c "%%f" >nul 2>&1
    if errorlevel 1 (
        echo [!!] Syntax error in %%f
        cd /
# Setup Safe Deploy System
$ProjectDir = "C:\Users\Thinksmart\Desktop\ThinksmartPost"
cd $ProjectDir

# ============================================================
# 1. T?O deploy-safe.bat
# ============================================================
Write-Host "[1/5] Creating deploy-safe.bat..." -ForegroundColor Cyan

@'
@echo off
REM ============================================================
REM AutoContentPoster Pro - Safe Auto-Deploy with Rollback
REM ============================================================

title AutoContentPoster Pro - Auto Deploy
color 0A

set PROJECT_DIR=C:\Users\Thinksmart\Desktop\ThinksmartPost
set PORT=4002
set LOG_FILE=%PROJECT_DIR%\logs\deploy.log
set BACKUP_DIR=%PROJECT_DIR%\.backups
set DEPLOY_TEST_DIR=%PROJECT_DIR%\.deploy-test

if not exist "%PROJECT_DIR%\logs" mkdir "%PROJECT_DIR%\logs"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo [%date% %time%] Deploy cycle started >> "%LOG_FILE%"

REM 1. CREATE .gitignore
echo.
echo [1/6] Setting up .gitignore...

(
    echo # Local configuration (DO NOT COMMIT)
    echo .env
    echo .env.local
    echo .env.*.local
    echo.
    echo # Cloudflare tunnel (LOCAL ONLY)
    echo .cloudflared/
    echo.
    echo # Deployment artifacts
    echo .backups/
    echo .deploy-test/
    echo.
    echo # Logs
    echo logs/
    echo *.log
    echo.
    echo # Dependencies
    echo node_modules/
    echo.
    echo # OS
    echo Thumbs.db
    echo .DS_Store
) > "%PROJECT_DIR%\.gitignore"

echo [OK] .gitignore created

REM 2. BACKUP
echo.
echo [2/6] Backing up current state...

set BACKUP_TIME=%date:~10,4%%date:~4,2%%date:~7,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_PATH=%BACKUP_DIR%\backup-%BACKUP_TIME%

mkdir "%BACKUP_PATH%"
xcopy "%PROJECT_DIR%\server.js" "%BACKUP_PATH%" /Y >nul 2>&1
xcopy "%PROJECT_DIR%\package.json" "%BACKUP_PATH%" /Y >nul 2>&1

echo [OK] Backup created

REM 3. FETCH & CHECK
echo.
echo [3/6] Checking for code changes...

cd /d "%PROJECT_DIR%"

git remote update >nul 2>&1
if errorlevel 1 goto :skip_update

for /f %%i in ('git rev-parse HEAD') do set LOCAL_COMMIT=%%i
for /f %%i in ('git rev-parse @{u}') do set REMOTE_COMMIT=%%i

if "%LOCAL_COMMIT%"=="%REMOTE_COMMIT%" (
    echo [OK] No changes. Code is up-to-date.
    goto :health_check
)

echo [!!] New code detected. Deploying...

REM 4. GIT PULL
echo.
echo [4/6] Pulling latest code...

git stash >nul 2>&1
git pull --ff-only origin main >nul 2>&1
if errorlevel 1 (
    git pull --ff-only origin master >nul 2>&1
    if errorlevel 1 (
        echo [!!] Git pull failed!
        git merge --abort >nul 2>&1
        goto :rollback
    )
)

echo [OK] Code pulled

REM 5. TEST
echo.
echo [5/6] Testing deployment...

if exist "%DEPLOY_TEST_DIR%" rmdir /s /q "%DEPLOY_TEST_DIR%" >nul 2>&1
mkdir "%DEPLOY_TEST_DIR%"

xcopy "%PROJECT_DIR%\*.js" "%DEPLOY_TEST_DIR%" /Y >nul 2>&1
xcopy "%PROJECT_DIR%\package.json" "%DEPLOY_TEST_DIR%" /Y >nul 2>&1

cd /d "%DEPLOY_TEST_DIR%"
call npm ci --production >nul 2>&1
if errorlevel 1 (
    echo [!!] npm install failed!
    cd /d "%PROJECT_DIR%"
    goto :rollback
)

for %%f in (*.js) do (
    node -c "%%f" >nul 2>&1
    if errorlevel 1 (
        echo [!!] Syntax error in %%f
        cd /d "%PROJECT_DIR%"
        goto :rollback
    )
)

cd /d "%PROJECT_DIR%"
echo [OK] Tests passed!

REM 6. HEALTH CHECK
:health_check
echo.
echo [6/6] Health check...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

start /b node "%PROJECT_DIR%\server.js" >"%DEPLOY_TEST_DIR%\server-test.log" 2>&1
timeout /t 3 /nobreak >nul

curl -s http://localhost:%PORT%/health >nul 2>&1
if errorlevel 1 (
    echo [!!] Health check failed!
    taskkill /F /IM node.exe >nul 2>&1
    goto :rollback
)

echo [OK] Server healthy!
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [OK] ==========================================
echo [OK]  Deployment successful!
echo [OK] ==========================================
echo.

goto :end

:rollback
echo.
echo [!!] ==========================================
echo [!!]  DEPLOYMENT FAILED - ROLLING BACK
echo [!!] ==========================================
echo.

taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

git reset --hard HEAD >nul 2>&1
git clean -fd >nul 2>&1

echo [..] Reinstalling dependencies...
call npm install --production >nul 2>&1

echo [OK] Rollback complete
echo.

:skip_update
:end
echo [%date% %time%] Deploy cycle complete >> "%LOG_FILE%"
echo.
