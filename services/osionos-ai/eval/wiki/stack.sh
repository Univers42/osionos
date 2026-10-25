#!/bin/sh
# stack.sh — the throwaway stack of the Wikipedia import.
#
# A Postgres with the fixture and the two migrations, a TEI with the real
# embedder, and the real indexer of this worktree — the same shape as
# eval/run.sh, on a network and with names of its own.
#
# Two modes:
#   test    the tests of the importer, against the Postgres of the stack
#   measure 500 articles: the import, the indexer, and the numbers
#
# usage: sh stack.sh <test|measure> <path to osionos-ai-migration.sql> \
#                     <path to osionos-ai-rag-migration.sql>
set -eu

WIKI_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
EVAL_DIR=$(CDPATH='' cd -- "$WIKI_DIR/.." && pwd)
SERVICE_DIR=$(CDPATH='' cd -- "$EVAL_DIR/.." && pwd)
REPO_ROOT=$(CDPATH='' cd -- "$SERVICE_DIR/../.." && pwd)
LOCK="$WIKI_DIR/wiki.lock"

MODE="${1:-}"
shift || true
MIGRATIONS=""
for MIGRATION_ARG in "$@"; do
	if [ ! -f "$MIGRATION_ARG" ]; then
		echo "usage: sh stack.sh <test|measure> <migration.sql> [<migration.sql>]" >&2
		exit 2
	fi
	MIGRATIONS="$MIGRATIONS $MIGRATION_ARG"
done
if [ -z "$MODE" ] || [ -z "$MIGRATIONS" ]; then
	echo "usage: sh stack.sh <test|measure> <migration.sql> [<migration.sql>]" >&2
	exit 2
fi

lock_value() {
	sed -n "s/^$1=//p" "$LOCK" | head -n 1
}

NODE_IMAGE=$(lock_value NODE_IMAGE)
PG_IMAGE=$(lock_value PG_IMAGE)
TEI_IMAGE=$(lock_value TEI_IMAGE)
TEI_MODEL=$(lock_value TEI_MODEL)
TEI_MODEL_VOLUME=$(lock_value TEI_MODEL_VOLUME)
DATA_VOLUME=$(lock_value DATA_VOLUME)
BATCH_PAGES=$(lock_value BATCH_PAGES)

NETWORK="ai-wiki-net-$$"
DB_CONTAINER="ai-wiki-db"
TEI_CONTAINER="ai-wiki-tei"
INDEXER_CONTAINER="ai-wiki-indexer"
DEPS_VOLUME="osionos_ai_wiki_noddeps"
DATABASE="osionos_ai_test"
DB_USER="postgres"
DB_PASSWORD="ai_test_password"
DATABASE_URL="postgres://postgres:$DB_PASSWORD@$DB_CONTAINER:5432/$DATABASE"
OWNER_ID="22222222-2222-4222-8222-222222222222"
SAMPLE_ARTICLES="${WIKI_SAMPLE_ARTICLES:-500}"

# The shared harness of the throwaway stacks: the network, the fixture and
# the migrations. HARNESS_DIR is the directory of harness.sh.
HARNESS_LABEL=wiki
HARNESS_DIR="$SERVICE_DIR/eval"
# shellcheck source=../harness.sh
. "$HARNESS_DIR/harness.sh"

cleanup() {
	docker rm -f -v "$INDEXER_CONTAINER" "$TEI_CONTAINER" "$DB_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The psql of the stack: the answer of the query, without the header.
psql_query() {
	docker exec "$DB_CONTAINER" psql -tAc "$1" -U "$DB_USER" -d "$DATABASE"
}

echo "[wiki] network $NETWORK"
harness_network_create "$NETWORK"
docker rm -f -v "$DB_CONTAINER" "$TEI_CONTAINER" "$INDEXER_CONTAINER" >/dev/null 2>&1 || true

docker run -d --name "$DB_CONTAINER" --network "$NETWORK" \
	-e POSTGRES_PASSWORD="$DB_PASSWORD" \
	-e POSTGRES_USER="$DB_USER" \
	-e POSTGRES_DB="$DATABASE" \
	"$PG_IMAGE" >/dev/null
harness_wait_postgres "$DB_CONTAINER" "$DATABASE" "$DB_USER"
echo "[wiki] postgres is ready"

harness_apply_fixture "$DB_CONTAINER" "$DATABASE" "$DB_USER"
# shellcheck disable=SC2086
harness_apply_migrations "$DB_CONTAINER" "$DATABASE" "$DB_USER" $MIGRATIONS
echo "[wiki] the migrations are applied"

# The indexer needs pg, and the tests of the importer talk to the database
# with the same driver: it is installed in a throwaway volume, never in the
# repository.
docker volume inspect "$DEPS_VOLUME" >/dev/null 2>&1 || docker volume create "$DEPS_VOLUME" >/dev/null
docker run --rm -v "$DEPS_VOLUME:/deps" "$NODE_IMAGE" \
	sh -c 'mkdir -p /tmp/install && cd /tmp/install && npm install --silent --no-audit --no-fund pg@8.23.1 && cp -r /tmp/install/node_modules/* /deps/' >/dev/null
echo "[wiki] the node dependencies are installed"

if [ "$MODE" = "test" ]; then
	echo "[wiki] running the tests of the importer"
	docker run --rm -v "$REPO_ROOT:/app" -w /app --network "$NETWORK" \
		-v "$DEPS_VOLUME:/app/node_modules" \
		-e WIKI_TEST_DATABASE_URL="$DATABASE_URL" \
		"$NODE_IMAGE" node --test services/osionos-ai/eval/wiki/
	exit $?
fi

# --- the measurement ---------------------------------------------------------

echo "[wiki] waiting for the embedder"
docker run -d --name "$TEI_CONTAINER" --network "$NETWORK" \
	-v "$TEI_MODEL_VOLUME:/data" \
	--cpus 8 --memory 4g \
	"$TEI_IMAGE" --model-id "$TEI_MODEL" >/dev/null
docker run --rm --network "$NETWORK" -e TEI_URL="http://$TEI_CONTAINER:80" "$NODE_IMAGE" node -e '
(async () => {
	const deadline = Date.now() + 300000;
	while (Date.now() < deadline) {
		try {
			const answer = await fetch(process.env.TEI_URL + "/health");
			if (answer.ok) process.exit(0);
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	console.error("the embedder never became ready");
	process.exit(1);
})();
'
echo "[wiki] the embedder is ready"

echo "[wiki] importing $SAMPLE_ARTICLES articles"
IMPORT_START=$(date +%s)
# A POSIX pipeline exits with the status of psql, which is 0 on an empty
# input: the status of the importer goes through a file, or a crashed import
# reads as an empty success.
IMPORT_STATUS=$(mktemp)
{
	status=0
	docker run --rm -v "$REPO_ROOT:/app:ro" -v "$DATA_VOLUME:/data:ro" -w /app \
		"$NODE_IMAGE" node services/osionos-ai/eval/wiki/import.mjs \
		--workspace-owner "$OWNER_ID" \
		--limit "$SAMPLE_ARTICLES" \
		--batch "$BATCH_PAGES" \
		--jsonl /data/articles.jsonl || status=$?
	echo "$status" >"$IMPORT_STATUS"
} | docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DATABASE" >/dev/null
IMPORT_CODE=$(cat "$IMPORT_STATUS")
rm -f "$IMPORT_STATUS"
if [ "$IMPORT_CODE" != "0" ]; then
	echo "[wiki] the import failed with status $IMPORT_CODE" >&2
	exit 1
fi
IMPORT_END=$(date +%s)
echo "[wiki] the import is done in $((IMPORT_END - IMPORT_START))s"

PAGES=$(psql_query "select count(*) from public.osionos_pages")
QUEUED=$(psql_query "select count(*) from public.ai_index_queue")
LANE_ONE=$(psql_query "select count(*) from public.ai_index_queue where priority = 1")
LANE_ZERO=$(psql_query "select count(*) from public.ai_index_queue where priority = 0")
echo "[wiki] pages=$PAGES queued=$QUEUED lane1=$LANE_ONE lane0=$LANE_ZERO"

echo "[wiki] starting the real indexer"
docker run -d --name "$INDEXER_CONTAINER" --network "$NETWORK" \
	-v "$REPO_ROOT:/app" -v "$DEPS_VOLUME:/app/node_modules" \
	-w /app/services/osionos-ai \
	-e OSIONOS_AI_DATABASE_URL="$DATABASE_URL" \
	-e OSIONOS_AI_EMBED_URL="http://$TEI_CONTAINER:80" \
	-e OSIONOS_AI_EMBED_MODEL="$TEI_MODEL" \
	"$NODE_IMAGE" node --experimental-strip-types src/indexer/main.ts >/dev/null

waited=0
until [ "$(psql_query 'select count(*) from public.ai_index_queue')" = "0" ]; do
	waited=$((waited + 1))
	if [ "$waited" -gt 3600 ]; then
		echo "[wiki] the queue never emptied" >&2
		exit 1
	fi
	sleep 1
done
QUEUE_EMPTY=$(date +%s)
echo "[wiki] the queue is empty after $((QUEUE_EMPTY - IMPORT_END))s"

CHUNKS=$(psql_query "select count(*) from public.ai_chunks")
PAGES_AFTER=$(psql_query "select count(*) from public.osionos_pages")
SECONDS_INDEX=$((QUEUE_EMPTY - IMPORT_END))
echo "[wiki] pages=$PAGES_AFTER chunks=$CHUNKS seconds=$SECONDS_INDEX"
