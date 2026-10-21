-- pgbench writer: 500 tx/s of random page edits -- each dirties one queue row.
-- Run: docker exec -i ai-spike-pg pgbench -n -f /tmp/writer.sql --rate=500 -T 60 -c 4 -U postgres postgres
\set pid random(1, 2000)
UPDATE pages
SET content = jsonb_set(content, '{rev}', to_jsonb((content->>'rev')::int + 1)),
    updated_at = now()
WHERE n = :pid;
