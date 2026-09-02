FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --filter @rementum/worker... --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/worker apps/worker
COPY packages packages
RUN pnpm --filter @rementum/worker... build

# The runtime image used to carry every devDependency plus the packages' sources and tests.
# Pruning in place keeps the workspace symlinks intact; the final stage then copies only the
# pruned node_modules trees and the built output.
FROM build AS prod
# pnpm recreates node_modules when the production flag changes and asks first; a build has
# no terminal to answer, so the prompt is disabled. The filtered install leaves the root
# project's development toolchain in the virtual store, which the workspace-wide prune drops.
RUN pnpm install --prod --filter @rementum/worker... --frozen-lockfile --config.confirmModulesPurge=false \
  && pnpm prune --prod

FROM node:24-alpine
RUN addgroup -S rementum && adduser -S rementum -G rementum
WORKDIR /app
RUN mkdir -p /data/blobs /data/exports && chown -R rementum:rementum /data
COPY --from=prod /app/node_modules ./node_modules
COPY --from=prod /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=prod /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=prod /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
USER rementum
CMD ["node", "apps/worker/dist/worker.js"]
