#!/bin/sh
# The routing proof of the summary (context C393): the service IMAGE on a
# throwaway Postgres and Redis, three mock upstreams each behind an nginx
# proxy that logs every request, then provider-routing.ts, which drives three
# threads over HTTP and writes RESULTS-provider-routing.md. Exits non-zero when
# a thread fails.
#
# usage: MODELS_DIR=<groot checkout>/models AI_IMAGE=<osionos-ai image> \
#        sh services/osionos-ai/eval/provider-routing.sh
#
# Caveat: the image runs with NODE_ENV=development, because production ignores
# the two escape hatches the stack needs (a user endpoint on a private network,
# the provider URL override). The routing code is the same in both modes.
set -eu

SERVICE_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH='' cd -- "$SERVICE_DIR/../.." && pwd)
HARNESS_LABEL=routing-eval
HARNESS_DIR="$SERVICE_DIR/eval"
# shellcheck source=harness.sh
. "$HARNESS_DIR/harness.sh"

: "${MODELS_DIR:?MODELS_DIR must point at a groot checkout models/ directory}"
: "${AI_IMAGE:?AI_IMAGE must name the osionos-ai image under test}"
NODE_IMAGE=node:22-bookworm-slim
NETWORK="ai-routing-eval-$$"
PG_CONTAINER="ai-routing-pg-$$"
REDIS_CONTAINER="ai-routing-redis-$$"
MOCKS_CONTAINER="ai-routing-mocks-$$"
PROXY_CONTAINER="ai-routing-proxy-$$"
AI_CONTAINER="ai-routing-ai-$$"
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ai-routing.XXXXXX")

cleanup() {
	docker rm -f -v "$AI_CONTAINER" "$PROXY_CONTAINER" "$MOCKS_CONTAINER" "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
	rm -rf "$WORK_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

harness_migration_list "$MODELS_DIR" >"$WORK_DIR/migrations"
# Throwaway secrets of this run only: the service and the driver share them.
SESSION_SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
KEK=$(head -c 32 /dev/urandom | base64)

harness_network_create "$NETWORK"
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" --network-alias pg \
	-e POSTGRES_PASSWORD=ai_routing_password -e POSTGRES_USER=postgres -e POSTGRES_DB=osionos_ai_routing \
	pgvector/pgvector:0.8.0-pg16 >/dev/null
docker run -d --name "$REDIS_CONTAINER" --network "$NETWORK" --network-alias redis redis:7.4-alpine >/dev/null
harness_wait_postgres "$PG_CONTAINER" osionos_ai_routing postgres
harness_apply_fixture "$PG_CONTAINER" osionos_ai_routing postgres
while IFS= read -r migration; do
	harness_apply_migrations "$PG_CONTAINER" osionos_ai_routing postgres "$migration"
done <"$WORK_DIR/migrations"

# The mocks pick their ports; the proxy is configured from them. Each proxy
# shares the mocks' network namespace, so it reaches them on the loopback.
for name in platform userKey userEndpoint; do : >"$WORK_DIR/$name.log"; done
chmod 666 "$WORK_DIR"/*.log
docker run -d --name "$MOCKS_CONTAINER" --network "$NETWORK" --network-alias mocks \
	--user "$(id -u):$(id -g)" -v "$REPO_ROOT:/app:ro" -v "$WORK_DIR:/work" -w /app/services/osionos-ai \
	"$NODE_IMAGE" node --experimental-strip-types eval/provider-routing-mocks.ts /work/ports.json >/dev/null
waited=0
until [ -s "$WORK_DIR/ports.json" ]; do
	waited=$((waited + 1))
	[ "$waited" -le 60 ] || { echo "[$HARNESS_LABEL] the mocks never started" >&2; docker logs "$MOCKS_CONTAINER" >&2; exit 1; }
	sleep 1
done
port_of() { sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p" "$WORK_DIR/ports.json"; }
proxy_server() {
	printf '  server { listen %s; access_log /work/%s.log routing; location / { proxy_pass http://127.0.0.1:%s; proxy_buffering off; proxy_http_version 1.1; } }\n' "$1" "$2" "$(port_of "$2")"
}
{
	echo 'events {}'
	echo 'http {'
	echo "  log_format routing '\$request_method \$request_uri \$status';"
	proxy_server 8001 platform
	proxy_server 8002 userKey
	proxy_server 8003 userEndpoint
	echo '}'
} >"$WORK_DIR/nginx.conf"
docker run -d --name "$PROXY_CONTAINER" --network "container:$MOCKS_CONTAINER" \
	-v "$WORK_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$WORK_DIR:/work" nginx:alpine >/dev/null

docker run -d --name "$AI_CONTAINER" --network "$NETWORK" --network-alias ai \
	-e NODE_ENV=development \
	-e OSIONOS_AI_PORT=4300 \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_routing_password@pg:5432/osionos_ai_routing" \
	-e OSIONOS_AI_REDIS_URL="redis://redis:6379" \
	-e OSIONOS_APP_SESSION_SECRET="$SESSION_SECRET" \
	-e OSIONOS_APP_SESSION_TTL_SECONDS=3600 \
	-e OSIONOS_SESSION_CUTOFFS=off \
	-e OSIONOS_BAAS_URL="https://baas.invalid" \
	-e SERVICE_ROLE_KEY="routing-eval-service-role-key" \
	-e OSIONOS_AI_SUMMARY=on \
	-e OSIONOS_AI_UPSTREAM_BASE_URL="http://mocks:8001/v1" \
	-e OSIONOS_AI_DEV_PROVIDER_BASE_URLS='{"openrouter":"http://mocks:8002/v1"}' \
	-e OSIONOS_AI_DEV_ENDPOINT_HOSTS=mocks \
	-e OSIONOS_AI_CATALOG_URL="http://127.0.0.1:1/api.json" \
	-e OSIONOS_AI_KEK="$KEK" -e OSIONOS_AI_KEK_ID=k1 \
	-e OSIONOS_AI_PLATFORM_MODELS='[{"id":"mock-model","label":"Mock model","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0,"default":true}]' \
	-e OSIONOS_AI_MAX_OUTPUT_TOKENS=4096 \
	-e OSIONOS_AI_USER_DAILY_MICROUSD=200000 \
	-e OSIONOS_AI_PLATFORM_DAILY_MICROUSD=20000000 \
	-e OSIONOS_AI_RUNS_PER_MINUTE=100 \
	"$AI_IMAGE" >/dev/null

docker run --rm --network "$NETWORK" \
	--user "$(id -u):$(id -g)" -v "$REPO_ROOT:/app" -v "$WORK_DIR:/work:ro" -w /app/services/osionos-ai \
	-e AI_URL=http://ai:4300 -e LOG_DIR=/work -e MOCKS_URL=http://mocks:8100 \
	-e USER_ENDPOINT_URL=http://mocks:8003/v1 \
	-e OSIONOS_APP_SESSION_SECRET="$SESSION_SECRET" \
	-e AI_EVAL_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
	-e AI_EVAL_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)" \
	-e AI_EVAL_IMAGE="$AI_IMAGE $(docker image inspect -f '{{.Id}}' "$AI_IMAGE" | cut -c1-19)" \
	-e AI_EVAL_COMMAND="MODELS_DIR=<groot>/models AI_IMAGE=<image> sh services/osionos-ai/eval/provider-routing.sh" \
	-e AI_EVAL_RESULTS_FILE="${AI_EVAL_RESULTS_FILE:-RESULTS-provider-routing.md}" \
	"$NODE_IMAGE" sh -c '
		for i in $(seq 1 90); do node -e "fetch(process.env.AI_URL + \"/api/ai/health\").then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" && break; sleep 1; done
		node --experimental-strip-types eval/provider-routing.ts' || {
	status=$?
	echo "[$HARNESS_LABEL] the driver failed ($status); service log tail:" >&2
	docker logs --tail 40 "$AI_CONTAINER" >&2
	exit "$status"
}
