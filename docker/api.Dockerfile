# API service — same as root Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Prisma generate: retry on network/DNS failure (EAI_AGAIN), sleep 30s between attempts
RUN for i in 1 2 3 4 5; do (npx prisma generate && break) || sleep 30; done
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
COPY docker/entrypoint.sh /app/entrypoint.sh
# Copiar do stage build (já inclui `COPY . .`) — evita falha quando o contexto do runtime não expõe `scripts/`.
COPY --from=build /app/scripts/prisma-baseline-resolve.sh /app/scripts/prisma-baseline-resolve.sh

RUN chown -R app:app /app/node_modules /app/prisma /app/scripts
RUN chmod +x /app/entrypoint.sh /app/scripts/prisma-baseline-resolve.sh

USER app

EXPOSE 3000
# start-period: migrate + seed (staging) + Nest podem exceder 60s no Railway.
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -sf http://localhost:3000/v1/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
