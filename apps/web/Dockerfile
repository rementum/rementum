FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @rementum/web... --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
ARG NEXT_PUBLIC_REMENTUM_API_URL
ENV NEXT_PUBLIC_REMENTUM_API_URL=$NEXT_PUBLIC_REMENTUM_API_URL
RUN pnpm --filter @rementum/web build

FROM node:24-alpine
RUN addgroup -S rementum && adduser -S rementum -G rementum
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER rementum
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
