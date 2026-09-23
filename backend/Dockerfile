FROM node:22.20.0-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate
COPY src ./src
COPY scripts ./scripts
COPY test/evaluations/recommendation-fixtures.ts ./test/evaluations/recommendation-fixtures.ts
RUN npm run build
RUN test -f dist/src/main.js && test -f dist/scripts/bootstrap.js && test -f dist/scripts/import-dataset.js && test -f dist/prisma/seed.js
RUN npm prune --omit=dev

FROM node:22.20.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --chown=node:node data/fixtures ./data/fixtures
COPY --chown=node:node data/dataset-rules.json ./data/dataset-rules.json
RUN mkdir -p /app/reports && chown node:node /app/reports
USER node
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
