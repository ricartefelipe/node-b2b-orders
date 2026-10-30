# API service — same as root Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Prisma generate: retry on network/DNS failure (EAI_AGAIN), sleep 30s between attempts.
# Esgotadas as tentativas o build falha: um retry não transforma erro em sucesso.
RUN for i in 1 2 3 4 5; do \
        npx prisma generate && break; \
        if [ "$i" = 5 ]; then echo "prisma generate falhou em $i tentativas" >&2; exit 1; fi; \
        sleep 30; \
    done
RUN for i in 1 2 3; do \
        npm run build && break; \
        if [ "$i" = 3 ]; then echo "npm run build falhou em $i tentativas" >&2; exit 1; fi; \
        sleep 15; \
    done

# ---
FROM node:20-alpine AS runtime

# Resiliente a falhas de DNS/rede durante o build; esgotadas as tentativas, falha.
RUN for i in 1 2 3; do \
        apk update && apk add --no-cache curl openssl && break; \
        if [ "$i" = 3 ]; then echo "apk add falhou em $i tentativas" >&2; exit 1; fi; \
        sleep 10; \
    done

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

# O npm empacotado na imagem base nao e usado em execucao (o CLI do Prisma e chamado por
# node_modules/.bin) e carrega dependencias com CVEs; sai da imagem final.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*
RUN chmod +x /app/entrypoint.sh /app/scripts/prisma-baseline-resolve.sh

USER app

EXPOSE 3000
# start-period: migrate + seed (staging) + Nest podem exceder 60s no Railway.
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=3 \
    CMD sh -c 'curl -sf "http://127.0.0.1:${PORT:-3000}/v1/healthz" || exit 1'

ENTRYPOINT ["/app/entrypoint.sh"]
