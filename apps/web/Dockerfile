FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.30.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @owl-memory/web... --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
ARG NEXT_PUBLIC_OWL_API_URL
ENV NEXT_PUBLIC_OWL_API_URL=$NEXT_PUBLIC_OWL_API_URL
RUN pnpm --filter @owl-memory/web build

FROM node:24-alpine
RUN addgroup -S owl && adduser -S owl -G owl
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER owl
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
