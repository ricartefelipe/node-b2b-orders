FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json jest.config.js /app/
COPY prisma /app/prisma
COPY src /app/src
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/prisma /app/prisma
COPY package.json /app/package.json

USER app

CMD ["node", "dist/src/worker/main.js"]
