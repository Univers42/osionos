# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    docker-dev.sh                                      :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#              #
#    Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONTRACT_DIR="${ROOT_DIR}/src/shared/notion-database-sys"
CONTRACT_URL="http://localhost:${CONTRACT_SERVER_PORT:-4100}/health"
PLAYGROUND_MONGO_PORT="${PLAYGROUND_MONGO_PORT:-27018}"

cd "${ROOT_DIR}"

if [[ -f /.dockerenv || "${OSIONOS_IN_DOCKER:-}" == "1" ]]; then
  exec pnpm exec vite --host 0.0.0.0 --port "${VITE_PORT:-3001}" --strictPort "$@"
fi

if ! docker info >/dev/null 2>&1; then
  echo "[dev] Docker is required. Start Docker, then run docker compose up -d --build osionos-app from the repository root." >&2
  exit 1
fi

if [[ -f "${CONTRACT_DIR}/Makefile" ]]; then
  if command -v curl >/dev/null 2>&1 && curl -sf "${CONTRACT_URL}" >/dev/null 2>&1; then
    echo "[dev] ObjectDatabase contract server already healthy at ${CONTRACT_URL}."
  else
    echo "[dev] Starting ObjectDatabase Mongo contract server via Docker..."
    env -u MONGO_PORT make -C "${CONTRACT_DIR}" seed-contract up-contract wait-contract
  fi
fi

echo "[dev] Starting osionos playground via Docker..."
MONGO_PORT="${PLAYGROUND_MONGO_PORT}" \
  docker compose -f docker-compose.base.yml -f docker-compose.dev.yml up -d --build playground

echo "[dev] Docker stack is running."
echo "[dev] Playground: http://localhost:${VITE_PORT:-3001}"
echo "[dev] Contract:   ${CONTRACT_URL}"
echo "[dev] Logs:       docker compose -f docker-compose.base.yml -f docker-compose.dev.yml logs -f playground"