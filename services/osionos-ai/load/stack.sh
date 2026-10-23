#!/bin/sh
# Brings up the throwaway stack for the P7a load test on a private network.
# usage: sh load/stack.sh [up|down]   (default up)
set -eu

ACTION="${1:-up}"
NETWORK="ai-load-net"
PG="ai-load-pg"
REDIS="ai-load-redis"
MOCK="ai-load-mock"
SVC="ai-load-service"
REPO="/home/dlesieur/wt-ai-night/wt-ai-load"
SHARED="/home/dlesieur/wt-ai-night/tmp"
FIXTURE="$REPO/services/osionos-ai/eval/fixture.sql"

down() {
	docker rm -f "$SVC" "$MOCK" "$REDIS" "$PG" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
	rm -f "$SHARED/mock.url"
}

if [ "$ACTION" = "down" ]; then
	down
	exit 0
fi

# Memory gate: at least 8 GiB available.
avail_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
if [ "$avail_kb" -lt $((8 * 1024 * 1024)) ]; then
	echo "insufficient memory: $((avail_kb / 1024 / 1024)) GiB available, need 8" >&2
	exit 1
fi

# Network.
if ! docker network create "$NETWORK" >/dev/null 2>&1; then
	subnet="172.16.$(( $$ % 250 + 1 )).0/24"
	docker network create --subnet "$subnet" "$NETWORK" >/dev/null
fi

# Postgres.
docker run -d --name "$PG" --network "$NETWORK" --network-alias pg \
	--cpus 1 --memory 1g \
	-e POSTGRES_PASSWORD=ai_load_password \
	-e POSTGRES_USER=postgres \
	-e POSTGRES_DB=osionos_ai_load \
	pgvector/pgvector:0.8.0-pg16 >/dev/null

# Redis.
docker run -d --name "$REDIS" --network "$NETWORK" --network-alias redis \
	--cpus 0.5 --memory 512m \
	redis:7.4-alpine >/dev/null

# Wait for postgres.
waited=0
until docker exec "$PG" pg_isready -U postgres -d osionos_ai_load >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 90 ]; then
		echo "postgres never became ready" >&2
		exit 1
	fi
	sleep 1
done
# Wait for redis.
waited=0
until docker exec "$REDIS" redis-cli ping >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 60 ]; then
		echo "redis never became ready" >&2
		exit 1
	fi
	sleep 1
done

# Fixture + migrations.
docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_load \
	< "$FIXTURE" >/dev/null
MIGS=$(sh /home/dlesieur/wt-ai-night/ops/ai-migs.sh)
for mig in $MIGS; do
	docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_load \
		< "$mig" >/dev/null
done

# Mock upstream.
docker run -d --name "$MOCK" --network "$NETWORK" --network-alias mock \
	--cpus 1 --memory 512m \
	-v "$REPO:/app" -v "$SHARED:/shared" -w /app/services/osionos-ai \
	-e LOAD_SHARED_DIR=/shared \
	node:22-bookworm-slim \
	sh -c 'node --experimental-strip-types load/mock.ts' >/dev/null

# Wait for mock.url.
waited=0
until [ -f "$SHARED/mock.url" ]; do
	waited=$((waited + 1))
	if [ "$waited" -gt 60 ]; then
		echo "mock never became ready" >&2
		exit 1
	fi
	sleep 1
done
# The mock reported its loopback URL; the service reaches it by the container alias.
MOCK_URL=$(sed 's/127\.0\.0\.1/mock/' "$SHARED/mock.url")

# Service.
docker run -d --name "$SVC" --network "$NETWORK" --network-alias service \
	--cpus 2 --memory 1g \
	-v "$REPO:/app" -w /app/services/osionos-ai \
	-e OSIONOS_AI_PORT=4300 \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_load_password@pg:5432/osionos_ai_load" \
	-e OSIONOS_AI_REDIS_URL="redis://redis:6379" \
	-e OSIONOS_APP_SESSION_SECRET="load-test-secret" \
	-e OSIONOS_APP_SESSION_TTL_SECONDS=3600 \
	-e OSIONOS_SESSION_CUTOFFS=off \
	-e OSIONOS_BAAS_URL="https://baas.invalid" \
	-e SERVICE_ROLE_KEY="test-service-role-key" \
	-e OSIONOS_AI_UPSTREAM_BASE_URL="$MOCK_URL/v1" \
	-e OSIONOS_AI_PLATFORM_MODELS='[{"id":"mock-model","label":"Mock model","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0,"default":true}]' \
	-e OSIONOS_AI_MAX_OUTPUT_TOKENS=1024 \
	-e OSIONOS_AI_USER_DAILY_MICROUSD=200000 \
	-e OSIONOS_AI_PLATFORM_DAILY_MICROUSD=20000000 \
	-e OSIONOS_AI_RUNS_PER_MINUTE=100000 \
	-e OSIONOS_AI_RELATED_PER_MINUTE=100000 \
	-e OSIONOS_ALLOWED_ORIGIN="http://localhost:3001" \
	node:22-bookworm-slim \
	sh -c 'node --experimental-strip-types src/server.ts' >/dev/null

# Wait for service health.
waited=0
until docker exec "$SVC" node -e "fetch('http://127.0.0.1:4300/api/ai/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 90 ]; then
		echo "service never became ready" >&2
		exit 1
	fi
	sleep 1
done

echo "stack up: service=$MOCK_URL (mock), service container=$SVC"