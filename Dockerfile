# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmjs.org
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://localhost:${PORT:-3000}/api/v1/health" || exit 1
# Migrations from compiled dist (no ts-node). Override CORS_ORIGINS / JWT_* at runtime.
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/database/typeorm.datasource.js && node dist/main.js"]
