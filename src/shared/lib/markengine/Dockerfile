# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
WORKDIR /app
ENV npm_config_fund=false
ENV npm_config_audit=false
ENV npm_config_update_notifier=false

FROM base AS deps
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --include=dev

FROM deps AS build
COPY tsconfig.json markdown.ts ./
COPY markdown ./markdown
RUN npm run build

FROM base AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY playground/server.js ./playground/server.js
COPY playground/public ./playground/public
EXPOSE 3000
CMD ["node", "playground/server.js"]

FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]