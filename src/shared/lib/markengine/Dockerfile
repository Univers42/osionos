# syntax=docker/dockerfile:1.7

FROM public.ecr.aws/docker/library/node:24-alpine AS base
WORKDIR /app
ENV npm_config_fund=false
ENV npm_config_audit=false
ENV npm_config_update_notifier=false

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev --ignore-scripts

FROM deps AS build
# Copy the whole source tree (.dockerignore drops node_modules/dist/.git/tests).
# The previous cherry-picked COPY omitted the root-level engine modules
# (renderCore.ts and the inline*.ts/shortcuts*.ts siblings of src/), so
# `npm run build:engine` failed with TS2307 "Cannot find module '../renderCore'".
COPY . .
RUN npm run build

FROM deps AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/playground/public ./playground/public
COPY --from=build /app/vite.config.ts ./vite.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]

FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]