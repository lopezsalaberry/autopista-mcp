# Multi-stage build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci && npm cache clean --force

COPY src/ ./src/

RUN npm run build

# Stage final
FROM node:24-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

USER nodejs

EXPOSE 3000

ENV TRANSPORT=http
ENV APP_PORT=3000
ENV NODE_ENV=production
ENV LOG_LEVEL=warn

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
