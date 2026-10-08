# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim
# Must match the @playwright/test version pinned in package.json.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.64.0-noble

# deps: all dependencies, cached until package-lock.json changes.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# dev: toolchain image used by scripts/ for lint, unit and integration tests.
FROM deps AS dev
COPY . .

FROM dev AS build
RUN npm run build

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# runtime: production image, one process serving the API and the built client.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/main.js"]

# e2e: Playwright runner with browsers preinstalled.
FROM ${PLAYWRIGHT_IMAGE} AS e2e
WORKDIR /e2e
COPY package.json package-lock.json ./
RUN npm ci
COPY playwright.config.ts tsconfig.base.json tsconfig.json ./
COPY tests/e2e ./tests/e2e
ENTRYPOINT ["npx", "playwright", "test"]
