# API service — same as root Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build
RUN npx prisma generate

# ---
FROM node:20-alpine AS runtime

RUN apk add --no-cache curl

WORKDIR /app

RUN addgroup -g 2000 app && adduser -u 2000 -G app -D app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./

USER app

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:3000/v1/healthz || exit 1

CMD ["node", "dist/src/main.js"]
