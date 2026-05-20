#!/bin/bash
# ── QTPosterPro: Start tunnel.sh ─────────────────────────
# Cách dùng:
#   chmod +x tunnel.sh && ./tunnel.sh
# ─────────────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_URL="http://localhost:4001"
LOG_FILE="$APP_DIR/logs/cloudflared.log"

# Tạo thư mục logs nếu chưa có
mkdir -p "$APP_DIR/logs"

# Kill tunnel cũ nếu đang chạy
pkill -f "cloudflared tunnel.*$APP_URL" 2>/dev/null

# Chạy tunnel
echo "🚀 Starting Cloudflare Tunnel..."
echo "   Logs: $LOG_FILE"
nohup cloudflared tunnel --url "$APP_URL" > "$LOG_FILE" 2>&1 &

# Đợi tunnel ready
sleep 8

# Lấy URL từ log
URL=$(grep -oP 'https://[a-z-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1)

if [ -n "$URL" ]; then
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  ✅ App:     $APP_URL"
  echo "  🌐 Public:  $URL"
  echo "═══════════════════════════════════════════"
  echo ""
  echo "📋 Copy URL để test trên điện thoại:"
  echo "   $URL"
else
  echo "⏳ Đợi thêm... Tunnel chưa sẵn sàng"
  sleep 5
  URL=$(grep -oP 'https://[a-z-]+\.trycloudflare\.com' "$LOG_FILE" | head -1)
  echo "   URL: $URL"
fi
