# Worker service — same build as API, different entrypoint
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build
RUN npx prisma generate

# ---
FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -g 2000 app && adduser -u 2000 -G app -D app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD find /tmp/worker-heartbeat -mmin -1 | grep -q . || exit 1

CMD ["node", "dist/src/worker/main.js"]
