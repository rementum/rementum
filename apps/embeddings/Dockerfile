FROM node:24-bookworm-slim AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/embeddings/package.json apps/embeddings/package.json
RUN pnpm install --filter @rementum/embeddings... --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/embeddings apps/embeddings
RUN pnpm --filter @rementum/embeddings build

# Prune to production dependencies in place so the runtime image ships neither the
# TypeScript toolchain nor the service's sources and tests.
FROM build AS prod
# pnpm recreates node_modules when the production flag changes and asks first; a build has
# no terminal to answer, so the prompt is disabled. The filtered install leaves the root
# project's development toolchain in the virtual store, which the workspace-wide prune drops.
RUN pnpm install --prod --filter @rementum/embeddings... --frozen-lockfile --config.confirmModulesPurge=false \
  && pnpm prune --prod

FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system rementum \
  && adduser --system --ingroup rementum rementum
WORKDIR /app
COPY --from=prod /app/node_modules ./node_modules
COPY --from=prod /app/apps/embeddings/node_modules ./apps/embeddings/node_modules
COPY --from=build /app/apps/embeddings/dist ./apps/embeddings/dist
# Docker seeds an empty `model_cache` volume from this directory, ownership included. Without
# it the volume is created root-owned, the unprivileged user cannot write the downloaded model,
# and every embed request fails with EACCES.
RUN mkdir -p /models && chown -R rementum:rementum /models
USER rementum
EXPOSE 8790
CMD ["node", "apps/embeddings/dist/server.js"]
