# ── QTPosterPro — Dockerfile ─────────────────────────────────────
# Dùng node:22-slim (Debian/glibc) để sharp dùng prebuilt binary
# Build nhanh ~30s, không cần compile từ source
# ─────────────────────────────────────────────────────────────────
FROM node:22-slim

WORKDIR /app

# Install build essentials (cho sharp prebuilt)
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy full source
COPY . .

# Build Tailwind CSS
RUN npx tailwindcss --input public/src/style.css --output public/dist/style.css --minify

# Create data & upload directories
RUN mkdir -p data public/uploads public/uploads/thumbs

# Non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /sbin/nologin appuser
RUN chown -R appuser:appgroup /app/data /app/public/uploads
USER appuser

EXPOSE 4001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4001/', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
