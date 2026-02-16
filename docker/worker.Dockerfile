FROM node:20-alpine AS build
WORKDIR /app

COPY package.json tsconfig.json jest.config.js /app/
COPY prisma /app/prisma
COPY src /app/src
RUN npm install
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/prisma /app/prisma
COPY package.json /app/package.json

CMD ["node", "dist/worker/main.js"]
