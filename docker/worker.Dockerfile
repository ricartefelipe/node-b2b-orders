# Worker service — same build as API, different entrypoint
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

WORKDIR /app

RUN addgroup -g 2000 app && adduser -u 2000 -G app -D app

RUN apk add --no-cache openssl

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./

RUN chown -R app:app /app/node_modules /app/prisma

# O npm empacotado na imagem base nao e usado em execucao (o CLI do Prisma e chamado por
# node_modules/.bin) e carrega dependencias com CVEs; sai da imagem final.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*

USER app

# start-period: RabbitMQ pode demorar (retries com backoff) — o processo escreve heartbeat desde o início.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD find /tmp/worker-heartbeat -mmin -1 | grep -q . || exit 1

CMD ["node", "dist/src/worker/main.js"]
