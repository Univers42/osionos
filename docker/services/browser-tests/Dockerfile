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
  pnpm install --frozen-lockfile --store-dir /pnpm/store

RUN pnpm exec playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*
