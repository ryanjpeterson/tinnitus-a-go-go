# syntax=docker/dockerfile:1.6
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS dev
ENV NODE_ENV=development
COPY apps/api apps/api
COPY packages/shared packages/shared
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM deps AS build
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter @tagg/api build

FROM node:${NODE_VERSION} AS prod
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/shared packages/shared
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
