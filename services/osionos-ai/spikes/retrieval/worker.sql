-- pgbench worker: claim up to 50 queue rows past the 10s debounce, delete them,
-- log the claim lag (time between "became eligible" and "claimed"), then sleep 0.2s.
-- Run: docker exec -i ai-spike-pg pgbench -n -f /tmp/worker.sql -T 75 -c 2 -U postgres postgres
WITH c AS (
    SELECT page_id
    FROM ai_index_queue
    WHERE dirty_at < now() - interval '10 seconds'
    ORDER BY dirty_at
    LIMIT 50
    FOR UPDATE SKIP LOCKED
),
d AS (
    DELETE FROM ai_index_queue q
    USING c
    WHERE q.page_id = c.page_id
    RETURNING q.page_id, q.dirty_at
)
INSERT INTO claims_log (page_id, lag, claimed_at)
SELECT page_id, clock_timestamp() - (dirty_at + interval '10 seconds'), clock_timestamp()
FROM d;

SELECT pg_sleep(0.2);
