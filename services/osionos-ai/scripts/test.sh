#!/bin/sh
# Integration harness for the osionos-ai service: a throwaway Postgres and a
# throwaway Redis on a private network, the AI migration applied on top, the test
# suite run in node:22. Nothing here touches the running stack.
#
# usage: sh scripts/test.sh /path/to/osionos-ai-migration.sql
set -eu

MIGRATION=${1:-}
if [ -z "$MIGRATION" ] || [ ! -f "$MIGRATION" ]; then
	echo "usage: test.sh <path to osionos-ai-migration.sql>" >&2
	exit 2
fi

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
NETWORK="ai-test-$$"
PG_CONTAINER="ai-test-pg-$$"
REDIS_CONTAINER="ai-test-redis-$$"

cleanup() {
	docker rm -f "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[test] network $NETWORK"
docker network create "$NETWORK" >/dev/null
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" --network-alias pg \
	-e POSTGRES_PASSWORD=ai_test_password \
	-e POSTGRES_USER=postgres \
	-e POSTGRES_DB=osionos_ai_test \
	pgvector/pgvector:0.8.0-pg16 >/dev/null
docker run -d --name "$REDIS_CONTAINER" --network "$NETWORK" --network-alias redis \
	redis:7.4-alpine >/dev/null

waited=0
until docker exec "$PG_CONTAINER" pg_isready -U postgres -d osionos_ai_test >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 90 ]; then
		echo "[test] postgres never became ready" >&2
		exit 1
	fi
	sleep 1
done
waited=0
until docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 60 ]; then
		echo "[test] redis never became ready" >&2
		exit 1
	fi
	sleep 1
done
echo "[test] postgres and redis are ready"

# The roles the AI migration grants to (service_role) and revokes from (anon,
# authenticated) must exist before it runs.
docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_test >/dev/null <<'SQL'
do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
	if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$$;

-- TEST-ONLY FIXTURE: the columns of osionos_workspace_members that
-- canAccessWorkspace reads. The production table (models/osionos-bridge-migration.sql)
-- carries created_at/updated_at and a foreign key to osionos_workspaces as well; this
-- fixture holds the same column types and nothing more.
create table if not exists public.osionos_workspace_members (
	workspace_id uuid not null,
	user_id uuid not null,
	role text not null,
	permissions text[] not null default array['read'],
	primary key (workspace_id, user_id)
);

-- TEST-ONLY FIXTURE: the columns of osionos_pages that the page context of a
-- run reads (src/pageContext.ts). The production table
-- (models/osionos-bridge-migration.sql) carries many more; this fixture holds
-- the same column types and nothing more.
create table if not exists public.osionos_pages (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null,
	owner_id uuid,
	title text not null default 'Untitled',
	visibility text not null default 'private',
	collaborators jsonb not null default '[]'::jsonb,
	content jsonb not null default '[]'::jsonb,
	archived_at timestamptz
);

-- TEST-ONLY FIXTURE: the block walker of the pages, copied verbatim from
-- models/osionos-page-search-migration.sql, so the real SQL of the page
-- context runs against the fixture.
CREATE OR REPLACE FUNCTION public.osionos_page_blocks(doc jsonb)
RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  WITH RECURSIVE walk(b) AS (
    SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(doc) = 'array' THEN doc ELSE '[]'::jsonb END)
    UNION ALL
    SELECT jsonb_array_elements(w.b -> 'children')
    FROM walk w
    WHERE jsonb_typeof(w.b -> 'children') = 'array'
  )
  SELECT b FROM walk
$$;

-- TEST-ONLY FIXTURE: the text projection of a page, copied verbatim from
-- models/osionos-page-search-migration.sql.
CREATE OR REPLACE FUNCTION public.osionos_page_text(doc jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(string_agg(b ->> 'content', ' '), '')
  FROM public.osionos_page_blocks(doc) AS b
  WHERE b ? 'content'
$$;
SQL

echo "[test] applying the AI migration"
docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_test < "$MIGRATION" >/dev/null

echo "[test] running the suite"
# --test-concurrency=1: the files share one database, and the conversations of
# one file must not disappear under the feet of another one.
docker run --rm --network "$NETWORK" \
	-v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	-e OSIONOS_AI_PORT=0 \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_test_password@pg:5432/osionos_ai_test" \
	-e OSIONOS_AI_REDIS_URL="redis://redis:6379" \
	-e OSIONOS_ALLOWED_ORIGIN="http://localhost:3001" \
	-e OSIONOS_APP_SESSION_SECRET="test-app-session-secret" \
	-e OSIONOS_APP_SESSION_TTL_SECONDS=3600 \
	-e OSIONOS_SESSION_CUTOFFS=off \
	-e OSIONOS_BAAS_URL="http://baas.invalid" \
	-e SERVICE_ROLE_KEY="test-service-role-key" \
	-e OSIONOS_AI_UPSTREAM_BASE_URL="http://127.0.0.1:1/v1" \
	-e OSIONOS_AI_PLATFORM_MODELS='[{"id":"placeholder","label":"Placeholder","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0,"default":true}]' \
	-e OSIONOS_AI_MAX_OUTPUT_TOKENS=1024 \
	-e OSIONOS_AI_USER_DAILY_MICROUSD=200000 \
	-e OSIONOS_AI_PLATFORM_DAILY_MICROUSD=20000000 \
	-e OSIONOS_AI_RUNS_PER_MINUTE=100 \
	node:22-bookworm-slim sh -c 'node --experimental-strip-types --test --test-concurrency=1 tests/*.test.ts'
