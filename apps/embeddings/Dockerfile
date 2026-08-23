FROM node:24-bookworm-slim AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/embeddings/package.json apps/embeddings/package.json
RUN pnpm install --filter @owl-memory/embeddings... --frozen-lockfile=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/embeddings apps/embeddings
RUN pnpm --filter @owl-memory/embeddings build

FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system owl \
  && adduser --system --ingroup owl owl
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/embeddings/node_modules ./apps/embeddings/node_modules
COPY --from=build /app/apps/embeddings/dist ./apps/embeddings/dist
USER owl
EXPOSE 8790
CMD ["node", "apps/embeddings/dist/server.js"]
