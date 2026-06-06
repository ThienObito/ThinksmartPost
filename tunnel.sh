#!/bin/bash
# ── QTPosterPro: Cloudflare Tunnel Setup ─────────────────────
# Dùng cho máy MỚI: chạy 1 lần, nhập token, auto start + deploy
#
# Cách dùng:
#   cd AutoContentPoster/
#   chmod +x tunnel.sh && ./tunnel.sh
#
# Lần đầu: script sẽ hỏi token Cloudflare, lưu lại để dùng sau
# Các lần sau: chạy thẳng, không cần nhập lại
# ─────────────────────────────────────────────────────────────

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_URL="http://localhost:4001"
LOG_FILE="$APP_DIR/logs/cloudflared.log"
TOKEN_FILE="$APP_DIR/.tunnel-token"
CONFIG_DIR="$HOME/.cloudflared"
DOMAIN="https://app.thinkedu.com.vn"

GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'; CYN='\033[0;36m'
NC='\033[0m'
info()  { echo -e "${CYN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GRN}[OK]${NC}    $1"; }
warn()  { echo -e "${YLW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERR]${NC}   $1"; }

# ─── CHECK CLOUDFLARED ───
if ! command -v cloudflared &>/dev/null; then
    echo ""
    warn "cloudflared chua cai. Dang tai ve..."
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
    ok "cloudflared: $(cloudflared --version 2>/dev/null | head -1)"
fi

mkdir -p "$APP_DIR/logs" "$CONFIG_DIR"

# Vô hiệu config.yml cũ
if [ -f "$CONFIG_DIR/config.yml" ]; then
    mv "$CONFIG_DIR/config.yml" "$CONFIG_DIR/config.yml.bak" 2>/dev/null
fi

# ─── GET TOKEN ───
TOKEN=""

if [ -f "$TOKEN_FILE" ]; then
    TOKEN=$(cat "$TOKEN_FILE" | tr -d ' \n\r')
    ok "Token: lay tu $TOKEN_FILE"
fi

if [ -z "$TOKEN" ] && [ -f "$APP_DIR/.env" ]; then
    ENV_TOKEN=$(grep '^CLOUDFLARE_TUNNEL_TOKEN=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//' | tr -d " '")
    if [ -n "$ENV_TOKEN" ]; then
        TOKEN="$ENV_TOKEN"
        ok "Token: lay tu .env (CLOUDFLARE_TUNNEL_TOKEN)"
    fi
fi

if [ -z "$TOKEN" ]; then
    clear
    echo ""
    echo -e "${YLW}==============================================${NC}"
    echo -e "${YLW}  CHUA CO TOKEN CLOUDFLARE                     ${NC}"
    echo -e "${YLW}                                              ${NC}"
    echo -e "${YLW}  Can token de ket noi tunnel toi app.thinkedu.com.vn ${NC}"
    echo -e "${YLW}                                              ${NC}"
    echo -e "${YLW}  CACH LAY TOKEN:                             ${NC}"
    echo -e "${YLW}  1. https://dash.cloudflare.com              ${NC}"
    echo -e "${YLW}  2. Zero Trust -> Networks -> Tunnels       ${NC}"
    echo -e "${YLW}  3. Click tunnel 'thinkedu'                  ${NC}"
    echo -e "${YLW}  4. Tab 'Run for specific OS'               ${NC}"
    echo -e "${YLW}  5. Copy --token <TOKEN>                   ${NC}"
    echo -e "${YLW}  6. Dan token ben duoi                      ${NC}"
    echo -e "${YLW}==============================================${NC}"
    echo ""

    read -rp "Dan token vao day (Enter de thoat): " USER_TOKEN

    if [ -z "$USER_TOKEN" ]; then
        err "Khong co token. Thoat."
        echo "Khi co token, chay lai: bash tunnel.sh"
        exit 1
    fi

    TOKEN="$USER_TOKEN"
    echo "$TOKEN" > "$TOKEN_FILE"
    ok "Da luu token vao $TOKEN_FILE (dung cho lan sau)"
fi

# ─── START ───
echo ""
info "Bat dau khoi dong..."

# Kill tunnel cu
pkill -f "cloudflared" 2>/dev/null || true
sleep 1

# Kiem tra app
cd "$APP_DIR"
APP_OK=false

if curl -sf -o /dev/null "$APP_URL/" 2>/dev/null; then
    APP_OK=true
    ok "App dang chay tren port 4001"
else
    warn "App chua chay. Dang khoi dong..."
    nohup node server.js > "$APP_DIR/logs/server.log" 2>&1 &
    sleep 3
    if curl -sf -o /dev/null "$APP_URL/" 2>/dev/null; then
        APP_OK=true
        ok "App khoi dong thanh cong"
    else
        err "App khong khoi dong duoc. Kiem tra: cat $APP_DIR/logs/server.log"
        exit 1
    fi
fi

# Chay tunnel
info "Dang ket noi Cloudflare Tunnel..."
nohup cloudflared tunnel run --no-autoupdate --token "$TOKEN" > "$LOG_FILE" 2>&1 &
TUNNEL_PID=$!
ok "Tunnel PID: $TUNNEL_PID (log: $LOG_FILE)"

# ─── VERIFY ───
info "Doi tunnel ket noi (15s)..."
sleep 15

if ! pgrep -f "cloudflared" > /dev/null; then
    err "Tunnel process died. Log:"
    tail -20 "$LOG_FILE"
    exit 1
fi
ok "Tunnel process dang chay"

echo ""
info "Kiem tra ket noi den $DOMAIN ..."

HTTP_CODE="000"
for i in 1 2 3; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$DOMAIN" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" != "000" ]; then
        break
    fi
    info "Lan $i: chua co phan hoi, doi them 5s..."
    sleep 5
done

echo ""
echo -e "${YLW}----------------------------------------------${NC}"
if [ "$HTTP_CODE" != "000" ]; then
    echo -e "${GRN}  HE THONG DA SAN SANG!${NC}"
else
    echo -e "${YLW}  Tunnel process dang chay nhung chua nhan duoc phan hoi tu domain.${NC}"
    echo -e "${YLW}  Kiem tra sau 30s: curl -s $DOMAIN${NC}"
fi

echo ""
echo "  App:  http://localhost:4001"
echo "  Live: $DOMAIN"
echo "  Log:  $LOG_FILE"
echo ""
echo -e "${YLW}----------------------------------------------${NC}"

# ─── PM2 (optional) ───
if command -v pm2 &>/dev/null; then
    echo ""
    read -rp "Cau hinh PM2 de auto-restart khi reboot? (y/N): " CHOICE
    if [ "$CHOICE" = "y" ] || [ "$CHOICE" = "Y" ]; then
        pkill -f "cloudflared" 2>/dev/null || true
        sleep 1
        cd "$APP_DIR"
        pm2 start server.js --name autocontent 2>/dev/null
        TOKEN_VAL=$(cat "$TOKEN_FILE")
        pm2 start "cloudflared tunnel run --no-autoupdate --token $TOKEN_VAL" --name cf-tunnel 2>/dev/null
        pm2 save
        ok "PM2 configured"
        info "De PM2 chay khi reboot: pm2 startup (chay lenh systemd)"
    fi
fi

echo ""
echo -e "${GRN}----------------------------------------------${NC}"
echo -e "${GRN}  Hoan tat! Truy cap: $DOMAIN${NC}"
echo -e "${GRN}----------------------------------------------${NC}"
echo ""
