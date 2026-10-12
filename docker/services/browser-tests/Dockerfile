# syntax=docker/dockerfile:1.7
# download (default): Playwright's pinned Chromium from its CDN.
# system: Debian's chromium, for hosts whose network blocks that CDN (403); the playwright
# config reads PW_CHROMIUM_PATH. Debian's build is not the one this Playwright release was
# tested against, hence opt-in.
ARG PW_BROWSER_SOURCE=download

FROM node:22-bookworm AS base

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

FROM base AS browser-download
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  rm -f /etc/apt/apt.conf.d/docker-clean \
  && pnpm exec playwright install --with-deps chromium

FROM base AS browser-system
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  rm -f /etc/apt/apt.conf.d/docker-clean \
  && apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates
ENV PW_CHROMIUM_PATH=/usr/bin/chromium

FROM browser-${PW_BROWSER_SOURCE}
