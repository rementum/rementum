FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --filter @rementum/web... --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/contracts packages/contracts
ARG NEXT_PUBLIC_REMENTUM_API_URL
ENV NEXT_PUBLIC_REMENTUM_API_URL=$NEXT_PUBLIC_REMENTUM_API_URL
# Node sizes its default heap from the machine's total memory, which the build shares
# with the running stack on a single host; the cap makes the compiler garbage-collect
# instead of inviting the OOM killer. The runtime stage does not inherit this ENV.
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm --filter @rementum/web... build

FROM node:24-alpine
RUN addgroup -S rementum && adduser -S rementum -G rementum
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER rementum
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
