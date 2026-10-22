#!/bin/sh
# **************************************************************************** #
#                                                                              #
#    test-db.sh                                                               #
#                                                                              #
#    The training job against a real database: the log in, a candidate out,  #
#    promoted only when it is not worse.                                     #
#                                                                              #
# **************************************************************************** #
#
# WHAT IT PROVES  (tests/test_job_db.py)
#   * the job reads `ai_events`, trains, and writes the registry row and the
#     factors: one champion, the vectors zero-padded to 64, the inner product
#     the database computes equal to the model's own score;
#   * the row carries what serving folds a user in with: the item Gram matrix
#     (the model's own YᵀY, row-major, factors² numbers) and the event
#     weights the model was trained with — and the context function hands
#     both back for a user with events;
#   * the promotion rule: the first run promotes, the second promotes its own
#     model (equal is not worse) and retires the first, and a model with
#     worse hyperparameters stays a CANDIDATE;
#   * an opted-out user's events do not train the model, and a synthetic-only
#     log is not a real one: the job skips it.
#
# THE ROLE
#   `osml_job` is a LOGIN role with NO grant of its own: it is a member of
#   service_role and nothing else, so the job works with service_role's grants
#   and needs nothing more. PostgreSQL does NOT inherit BYPASSRLS through a
#   membership, and COPY FROM is refused on a table with row-level security
#   without it, so the job does SET ROLE service_role first (as PostgREST
#   does): the role stays NOBYPASSRLS here, and the test proves it is enough.
#
# THE FIXTURE
#   The groot migrations, read-only, from the groot worktree: the roles, the
#   `auth, public` search_path, the prerequisite models, the events migration
#   and the factors migration — the fixture of scripts/verify/rec-factors.sh.
#   Then the serving migration too (the two columns of the registry, the
#   context function and the nearest search) — the fixture of
#   scripts/verify/rec-serving.sh, which needs nothing this one does not
#   already apply.
#
# ISOLATION
#   Throwaway containers only: a pgvector and a pytest container on a
#   throwaway docker network, no published port, no volume. The source is
#   mounted READ-ONLY, so the worktree is never written to. The live stack is
#   never touched, and everything is removed on every exit path.
#
# Usage:  sh scripts/test-db.sh <groot-root>
# Exit:   0 every test passed · 1 the fixture, the image or a test failed
#
set -eu

GROOT="${1:-}"
[ -n "${GROOT}" ] || {
	printf 'usage: test-db.sh <groot-root>\n' >&2
	exit 2
}
[ -d "${GROOT}/models" ] || {
	printf '[test-db] no models/ under %s\n' "${GROOT}" >&2
	exit 2
}

SERVICE="$(cd "$(dirname "$0")/.." && pwd)"
MODELS="${GROOT}/models"
FIX="${GROOT}/scripts/verify/models-grants"
CTN="osml-job-pg"
NET="osml-job-net"
PG_IMAGE="${PG_IMAGE:-pgvector/pgvector:0.8.0-pg16}"
PY_IMAGE="${PY_IMAGE:-python:3.12-slim}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/osml-job-db.XXXXXX")"
# The image is named after the worktree, so two worktrees never share one.
IMAGE="osml-job-test:$(printf '%s' "${SERVICE}" | cksum | cut -d' ' -f1)"
DATABASE_URL="postgresql://osml_job:osml_job@pg:5432/postgres"
OSML_CODE_SHA="${OSML_CODE_SHA:-abc1234}"

# The prerequisite models, in the order they need each other (the runner's
# ORDERED_FIRST first, then the alphabetical pass).
PREREQS="osionos-bridge-migration.sql osionos-chat-migration.sql
osionos-social-migration.sql osionos-engagement-migration.sql
osionos-comments-migration.sql osionos-favorites-migration.sql
osionos-feed-engagement-migration.sql"

note() { printf '[test-db] %s\n' "$*" >&2; }

teardown() {
	docker rm -f "${CTN}" >/dev/null 2>&1 || true
	docker network rm "${NET}" >/dev/null 2>&1 || true
	docker image rm -f "${IMAGE}" >/dev/null 2>&1 || true
	rm -rf "${WORK}"
}
trap teardown EXIT INT TERM

psql_q() { docker exec -i "${CTN}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt; }

# apply_file <path> — psql runs a file. The exit code is psql's.
apply_file() {
	tries=0
	while [ "${tries}" -lt 3 ]; do
		if docker exec -i "${CTN}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q <"$1" >"${WORK}/apply.log" 2>&1; then
			return 0
		fi
		tries=$((tries + 1))
		sleep 2
	done
	note "psql rejected $(basename "$1")"
	sed 's/^/  | /' "${WORK}/apply.log" >&2
	return 1
}

# apply_sql <sql> — psql runs a statement.
apply_sql() {
	if printf '%s\n' "$1" | psql_q >"${WORK}/apply.log" 2>&1; then
		return 0
	fi
	note "psql rejected a statement"
	sed 's/^/  | /' "${WORK}/apply.log" >&2
	return 1
}

start_pg() {
	command -v docker >/dev/null 2>&1 || {
		note "docker is required"
		exit 2
	}
	docker image inspect "${PG_IMAGE}" >/dev/null 2>&1 || docker pull "${PG_IMAGE}" >/dev/null 2>&1 || {
		note "the image ${PG_IMAGE} is not available"
		exit 1
	}
	docker network rm "${NET}" >/dev/null 2>&1 || true
	docker network create "${NET}" >/dev/null
	docker rm -f "${CTN}" >/dev/null 2>&1 || true
	docker run -d --name "${CTN}" --network "${NET}" --network-alias pg \
		-e POSTGRES_HOST_AUTH_METHOD=trust "${PG_IMAGE}" >/dev/null
	# The image's entrypoint starts a TEMPORARY server while it initialises
	# the data directory, and stops it before the real one: a connection in
	# that window is refused with "the database system is shutting down".
	# The server is ready when PID 1 IS postgres (the entrypoint has exec'd
	# it) and a query goes through.
	i=0
	while [ "${i}" -lt 60 ]; do
		if docker exec "${CTN}" sh -c 'test "$(cat /proc/1/comm)" = postgres' >/dev/null 2>&1 &&
			docker exec "${CTN}" psql -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
			return 0
		fi
		i=$((i + 1))
		sleep 1
	done
	note "postgres never became ready"
	exit 1
}

apply_fixture() {
	apply_file "${FIX}/roles.sql" || return 1
	# The live stack's search_path: a relation created without a schema lands
	# in the FIRST schema of the search_path, so the fixture has to spell the
	# schema out — exactly as scripts/verify/rec-factors.sh does.
	apply_sql "ALTER ROLE postgres IN DATABASE postgres SET search_path = auth, public;" || return 1
	apply_sql "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;" || return 1
	for base in ${PREREQS}; do
		apply_file "${MODELS}/${base}" || return 1
	done
	apply_file "${MODELS}/osionos-user-events-migration.sql" || return 1
	apply_file "${MODELS}/osionos-rec-factors-migration.sql" || return 1
	# The serving migration: the two columns of the registry (item_gram,
	# event_weights), the context function and the nearest search. It needs
	# the factors migration before it (the registry and the factors must
	# exist when its SQL is validated) and nothing else this fixture does
	# not already apply.
	apply_file "${MODELS}/osionos-rec-serving-migration.sql" || return 1
	# The job's role: a membership of service_role and nothing else. The job
	# does SET ROLE service_role (BYPASSRLS is service_role's own attribute, not
	# inherited through the membership, and COPY FROM needs it on RLS tables).
	apply_sql "CREATE ROLE osml_job LOGIN PASSWORD 'osml_job' NOBYPASSRLS;" || return 1
	apply_sql "GRANT service_role TO osml_job;" || return 1
	return 0
}

# The image: python:3.12-slim with the requirements (and libgomp1, which
# `implicit`'s CPU extension links against). The source is NOT in the image:
# it is mounted read-only, so the worktree is never written to.
build_image() {
	cat >"${WORK}/Dockerfile" <<EOF
FROM ${PY_IMAGE}
RUN apt-get update \\
    && apt-get install -y --no-install-recommends libgomp1 \\
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt
EOF
	docker build -t "${IMAGE}" -f "${WORK}/Dockerfile" "${SERVICE}" >"${WORK}/build.log" 2>&1 || {
		note "the image did not build"
		sed 's/^/  | /' "${WORK}/build.log" >&2
		return 1
	}
	return 0
}

run_tests() {
	docker run --rm --network "${NET}" \
		-v "${SERVICE}:/app:ro" -w /app \
		-e "DATABASE_URL=${DATABASE_URL}" \
		-e "OSML_CODE_SHA=${OSML_CODE_SHA}" \
		-e "PYTHONDONTWRITEBYTECODE=1" \
		-e "OPENBLAS_NUM_THREADS=1" \
		"${IMAGE}" pytest -q -m db -p no:cacheprovider tests
}

main() {
	start_pg
	note "postgres up in ${CTN}"
	apply_fixture || {
		note "the fixture failed"
		exit 1
	}
	note "fixture applied (the events migration, the factors migration, the serving migration, the osml_job role)"
	build_image || exit 1
	note "the image ${IMAGE} is built"
	run_tests
}

main "$@"
