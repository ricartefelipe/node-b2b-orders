# API service — same as root Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN for i in 1 2 3; do npx prisma generate && break || sleep 15; done
RUN for i in 1 2 3; do npm run build && break || sleep 15; done

# ---
FROM node:20-alpine AS runtime

# Resiliente a falhas de DNS/rede durante o build
RUN for i in 1 2 3; do apk update && apk add --no-cache curl openssl && break || sleep 10; done

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
