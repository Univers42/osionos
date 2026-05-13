# syntax=docker/dockerfile:1.7
FROM node:22-bookworm

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@10.32.1 --activate \
  && mkdir -p /pnpm/store \
  && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm/store

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  rm -f /etc/apt/apt.conf.d/docker-clean \
  && pnpm exec playwright install --with-deps chromium
