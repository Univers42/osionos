#!/bin/sh
# The shared parts of the throwaway stacks: the private network, the throwaway
# Postgres, the fixture and the migrations.
#
# Two harnesses use it — scripts/test.sh (the suite of the service) and
# eval/run.sh (the runner of the golden set) — so the fixture SQL is written
# ONCE (eval/fixture.sql) and the two stacks are the same shape.
#
# The functions take the names they need; nothing here keeps state between
# two calls. The caller sets HARNESS_LABEL for the messages, and HARNESS_DIR
# for the directory of this file: $0 is the CALLER's script when this file is
# sourced, so it cannot be used here.
#
# usage: HARNESS_DIR=<this directory> . eval/harness.sh

: "${HARNESS_DIR:?the caller must set HARNESS_DIR before sourcing harness.sh}"
HARNESS_FIXTURE="$HARNESS_DIR/fixture.sql"

# The private network of a run.
#
# Docker's default address pool can be exhausted on a busy machine (every
# stack takes a block of it). Then the harness asks for a subnet of its own:
# the last two bytes come from the pid, so two runs never share one.
harness_network_create() {
	network=$1
	if ! docker network create "$network" >/dev/null 2>&1; then
		subnet="172.16.$(( $$ % 250 + 1 )).0/24"
		echo "[$HARNESS_LABEL] the address pool is full: the network takes $subnet"
		docker network create --subnet "$subnet" "$network" >/dev/null
	fi
}

# The fixture: the roles, the two tables and the two functions.
harness_apply_fixture() {
	container=$1
	database=$2
	user=$3
	docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U "$user" -d "$database" \
		< "$HARNESS_FIXTURE" >/dev/null
}

# The migrations, in the order they are given.
harness_apply_migrations() {
	container=$1
	database=$2
	user=$3
	shift 3
	for migration in "$@"; do
		echo "[$HARNESS_LABEL] applying $migration"
		docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U "$user" -d "$database" \
			< "$migration" >/dev/null
	done
}

# Postgres is ready to take the fixture.
harness_wait_postgres() {
	container=$1
	database=$2
	user=$3
	waited=0
	until docker exec "$container" pg_isready -U "$user" -d "$database" >/dev/null 2>&1; do
		waited=$((waited + 1))
		if [ "$waited" -gt 90 ]; then
			echo "[$HARNESS_LABEL] postgres never became ready" >&2
			return 1
		fi
		sleep 1
	done
}
