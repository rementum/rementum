FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --filter @owl-memory/api... --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @owl-memory/api... build

FROM node:24-alpine
RUN apk add --no-cache wget && addgroup -S owl && adduser -S owl -G owl
WORKDIR /app
RUN mkdir -p /data/blobs /data/exports && chown -R owl:owl /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages ./packages
USER owl
EXPOSE 8787
CMD ["node", "apps/api/dist/server.js"]
