# ── Stage 1: Build ──
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for sharp
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

# ── Stage 2: Production ──
FROM node:22-alpine

WORKDIR /app

# Install runtime dependencies for sharp
RUN apk add --no-cache vips-dev fftw-dev build-base && \
    npm install -g sharp && \
    apk del build-base

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy app source
COPY . .

# Create required directories
RUN mkdir -p data public/uploads public/uploads/thumbs public/dist

# Build Tailwind CSS
RUN npx tailwindcss --input public/src/style.css --output public/dist/style.css --minify

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app/data /app/public/uploads
USER appuser

EXPOSE 4001

ENV NODE_ENV=production

CMD ["node", "server.js"]
