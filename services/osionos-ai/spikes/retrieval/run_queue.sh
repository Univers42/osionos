#!/usr/bin/env bash
# AI-P0b queue spike driver. Runs writer + worker pgbench concurrently and samples
# the queue size once a second. Everything is bounded by `timeout`.
#   ./run_queue.sh            (expects ai-spike-pg already up and queue.sql applied)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PG="docker exec -i ai-spike-pg"

# pgbench needs the scripts inside the container.
$PG sh -c 'cat > /tmp/writer.sql' < "$HERE/writer.sql"
$PG sh -c 'cat > /tmp/worker.sql' < "$HERE/worker.sql"
$PG psql -U postgres -q -c "DROP TABLE IF EXISTS queue_samples; CREATE TABLE queue_samples (ts timestamptz, size int);"

echo "== writer: pgbench -n -f writer.sql --rate=500 -T 60 -c 4"
timeout 150 docker exec -i ai-spike-pg pgbench -n -f /tmp/writer.sql --rate=500 -T 60 -c 4 -U postgres postgres \
  > "$HERE/writer.log" 2>&1 &
WRITER=$!

sleep 2
echo "== worker: pgbench -n -f worker.sql -T 75 -c 2"
timeout 150 docker exec -i ai-spike-pg pgbench -n -f /tmp/worker.sql -T 75 -c 2 -U postgres postgres \
  > "$HERE/worker.log" 2>&1 &
WORKER=$!

echo "== sampling queue size 1/s for 78s"
for _ in $(seq 1 78); do
  timeout 20 docker exec -i ai-spike-pg psql -U postgres -tA -c \
    "INSERT INTO queue_samples SELECT clock_timestamp(), count(*) FROM ai_index_queue;" >/dev/null
  sleep 1
done

wait $WRITER || true
wait $WORKER || true
echo "== done"
