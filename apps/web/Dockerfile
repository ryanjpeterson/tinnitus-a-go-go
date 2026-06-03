# syntax=docker/dockerfile:1.6
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS dev
ENV NODE_ENV=development
COPY apps/web apps/web
COPY packages/shared packages/shared
COPY apps/web/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
WORKDIR /app/apps/web
EXPOSE 4444
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["pnpm", "dev"]

FROM deps AS build
COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm --filter @tagg/web build

FROM nginx:alpine AS prod
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
