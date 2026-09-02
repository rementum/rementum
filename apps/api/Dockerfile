FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --filter @rementum/api... --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @rementum/api... build

# The runtime image used to carry every devDependency plus the packages' sources and tests.
# Pruning in place keeps the workspace symlinks intact; the final stage then copies only the
# pruned node_modules trees and the built output.
FROM build AS prod
# pnpm recreates node_modules when the production flag changes and asks first; a build has
# no terminal to answer, so the prompt is disabled. The filtered install leaves the root
# project's development toolchain in the virtual store, which the workspace-wide prune drops.
RUN pnpm install --prod --filter @rementum/api... --frozen-lockfile --config.confirmModulesPurge=false \
  && pnpm prune --prod

FROM node:24-alpine
RUN apk add --no-cache wget && addgroup -S rementum && adduser -S rementum -G rementum
WORKDIR /app
RUN mkdir -p /data/blobs /data/exports && chown -R rementum:rementum /data
COPY --from=prod /app/node_modules ./node_modules
COPY --from=prod /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=prod /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
# The migrate service runs this image; migrate.js resolves ../migrations from packages/db/dist.
COPY --from=build /app/packages/db/migrations ./packages/db/migrations
USER rementum
EXPOSE 8787
CMD ["node", "apps/api/dist/server.js"]
