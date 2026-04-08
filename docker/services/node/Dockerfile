# docker/services/node/Dockerfile
#
# Base development image for the monorepo.
# Alpine + Node 22 + pnpm — as lightweight as possible.
# Dependencies are installed once and cached in a named volume.
# Source code is bind-mounted at runtime for instant HMR.

FROM node:22-alpine

# Build essentials for native Node addons (cmake-js, bcrypt, etc.)
RUN apk add --no-cache python3 make g++ cmake git bash

# Enable pnpm via corepack (built into Node 22)
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

# Entrypoint: install deps if stale, then exec the command
COPY docker/services/node/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
