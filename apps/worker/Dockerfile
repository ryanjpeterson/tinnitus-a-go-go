# syntax=docker/dockerfile:1.6
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
# ffmpeg: video transcoding, poster-frame extraction, AND HEIC/HEIF decode.
# Sharp's bundled libvips lacks the HEVC plugin for modern iPhone HEICs, so
# the worker pre-converts HEIC → JPEG via ffmpeg before passing to Sharp.
RUN apk add --no-cache ffmpeg
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY apps/worker/package.json apps/worker/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS dev
ENV NODE_ENV=development
COPY apps/worker apps/worker
# The worker imports the Drizzle schema directly from the api workspace (relative import).
# We need api's source on disk for tsx to resolve it.
COPY apps/api apps/api
COPY packages/shared packages/shared
WORKDIR /app/apps/worker
CMD ["pnpm", "dev"]

FROM deps AS build
COPY apps/worker apps/worker
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter @tagg/worker build

FROM node:${NODE_VERSION} AS prod
# Same as base — ffmpeg handles HEIC decode and video transcoding
RUN apk add --no-cache ffmpeg
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/worker/package.json apps/worker/
COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY --from=build /app/packages/shared packages/shared
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
