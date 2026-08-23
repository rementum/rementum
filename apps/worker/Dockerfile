FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --filter @owl-memory/worker... --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/worker apps/worker
COPY packages packages
RUN pnpm --filter @owl-memory/worker... build

FROM node:24-alpine
RUN addgroup -S owl && adduser -S owl -G owl
WORKDIR /app
RUN mkdir -p /data/blobs /data/exports && chown -R owl:owl /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages ./packages
USER owl
CMD ["node", "apps/worker/dist/worker.js"]
