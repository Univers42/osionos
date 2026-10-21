-- AI-P0b index-queue spike: trigger-fed dirty queue + claim/delete worker.
--
-- pages (2000 rows) -> trigger upserts ONE queue row per page (PK on page_id)
--                    -> worker claims rows older than a 10s debounce, logs the lag.
DROP TABLE IF EXISTS claims_log, ai_index_queue, pages CASCADE;

CREATE TABLE pages (
    id           uuid PRIMARY KEY,
    n            int NOT NULL UNIQUE,          -- stable 1..2000 handle for pgbench random()
    workspace_id uuid NOT NULL,
    title        text,
    content      jsonb,
    visibility   text,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_index_queue (
    page_id      uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    dirty_at     timestamptz NOT NULL,
    attempts     int NOT NULL DEFAULT 0
);
CREATE INDEX ai_index_queue_dirty_at_idx ON ai_index_queue (dirty_at);

CREATE TABLE claims_log (
    page_id    uuid,
    lag        interval,
    claimed_at timestamptz NOT NULL DEFAULT now()
);

-- One trigger for INSERT and UPDATE. The brief's WHEN (pg_trigger_depth() = 0)
-- keeps nested/derived writes out; the OLD/NEW distinctness check drops no-op
-- updates that the `UPDATE OF <cols>` event fires on anyway.
CREATE FUNCTION enqueue_page() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
        RETURN NEW;
    END IF;
    INSERT INTO ai_index_queue (page_id, workspace_id, dirty_at)
    VALUES (NEW.id, NEW.workspace_id, now())
    ON CONFLICT (page_id) DO UPDATE SET dirty_at = excluded.dirty_at;
    RETURN NEW;
END $$;

CREATE TRIGGER pages_enqueue
AFTER INSERT OR UPDATE OF content, title, visibility, workspace_id ON pages
FOR EACH ROW WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION enqueue_page();

INSERT INTO pages (id, n, workspace_id, title, content, visibility, updated_at)
SELECT gen_random_uuid(), g, gen_random_uuid(), 'page ' || g,
       jsonb_build_object('body', 'seed ' || g, 'rev', 0), 'shared', now()
FROM generate_series(1, 2000) g;

-- The seed INSERT must not leave a queue backlog before the run starts.
TRUNCATE ai_index_queue;
SELECT count(*) AS pages_seeded FROM pages;
