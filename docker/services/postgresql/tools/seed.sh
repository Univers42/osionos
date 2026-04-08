#!/bin/bash
set -e
PGUSER="${POSTGRES_USER:-notion_user}"
PGDB="${POSTGRES_DB:-notion_db}"

echo "[pg-seed] Waiting for PostgreSQL to accept connections..."
until pg_isready -U "$PGUSER" -d "$PGDB" -q; do sleep 1; done

echo "[pg-seed] Running 001_schema.sql..."
psql -U "$PGUSER" -d "$PGDB" -f /seed/001_schema.sql

echo "[pg-seed] Running 002_seed.sql..."
psql -U "$PGUSER" -d "$PGDB" -f /seed/002_seed.sql

echo "[pg-seed] Done — PostgreSQL seeded successfully."
