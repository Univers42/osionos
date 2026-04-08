# PostgreSQL 16 — Cheatsheet

> **Image**: `postgres:16-alpine` · **Port**: 5432 · **Shell**: `psql`  
> Default creds: `notion_user` / `notion_pass` · DB: `notion_db`

---

## Table of contents

1. [How it works in this project](#how-it-works-in-this-project)
2. [Connecting](#connecting)
3. [psql — the interactive shell](#psql--the-interactive-shell)
4. [Data types (the important ones)](#data-types-the-important-ones)
5. [DDL — creating & altering tables](#ddl--creating--altering-tables)
6. [CRUD operations](#crud-operations)
7. [Querying & filtering](#querying--filtering)
8. [Joins](#joins)
9. [Aggregation & grouping](#aggregation--grouping)
10. [Indexes](#indexes)
11. [Transactions](#transactions)
12. [Import / Export](#import--export)
13. [Administration](#administration)
14. [Troubleshooting](#troubleshooting)

---

## How it works in this project

PostgreSQL runs as a Docker container (`notion_postgres`) using the `src` profile only.
On first start, two things happen:

1. Docker creates the default `notion_db` database (from `POSTGRES_DB` env var)
2. `docker/init-databases.sql` runs and creates `notion_src_db` for isolated src data

The seed data lives in `src/store/dbms/relational/` (SQL files mounted at `/seed/`).

```
docker-compose.yml
  └─ postgres service
       ├─ Volume: pg_data:/var/lib/postgresql/data (persists across restarts)
       ├─ Config: conf/postgresql.conf (tuned for dev — fsync off, relaxed WAL)
       ├─ Auth:   conf/pg_hba.conf (trust local, md5 remote)
       ├─ Init:   docker/init-databases.sql → /docker-entrypoint-initdb.d/
       └─ Seed:   src/store/dbms/relational/ → /seed/ (read-only mount)
```

---

## Connecting

### From the host (via Make)

```bash
# Open an interactive psql session (default DB)
make psql

# Connect to a specific database
docker exec -it notion_postgres \
  psql -U notion_user -d notion_src_db
```

### Connection string anatomy

```
postgresql://USER:PASS@HOST:PORT/DATABASE
             ────  ────  ────────  ──────
              │     │      │         └─ database name
              │     │      └─ hostname (localhost on host, postgres inside Docker)
              │     └─ password
              └─ username
```

### From app code

```bash
# The env var used by our PostgresDbAdapter
DATABASE_URL=postgresql://notion_user:notion_pass@postgres:5432/notion_db
```

---

## psql — the interactive shell

psql is the OG database CLI. It has two modes: SQL commands (end with `;`) and
backslash meta-commands (start with `\`).

### Essential meta-commands

```
\?          Show all meta-commands (help)
\h          Show SQL command help
\h SELECT   Show help for a specific SQL command

\l          List all databases
\c dbname   Connect to a different database
\dt         List tables in current schema
\dt+        List tables with sizes
\d tablename   Describe a table (columns, types, constraints)
\d+ tablename  Describe with storage info
\di         List indexes
\di+ tablename  Show indexes on a table
\dn         List schemas
\du         List users/roles
\df         List functions
\dv         List views
\ds         List sequences

\x          Toggle expanded display (vertical output — great for wide rows)
\x auto     Auto-toggle based on terminal width
\timing     Toggle query execution timing
\a          Toggle aligned/unaligned output
\pset format csv   Output as CSV (great for piping)

\e          Open last query in $EDITOR
\i file.sql Execute SQL from a file
\o file.txt Send output to a file (toggle)
\copy       Client-side COPY (doesn't need superuser)

\q          Quit psql
```

### Useful one-liners

```bash
# Run a single SQL command from the host
docker exec -it notion_postgres \
  psql -U notion_user -d notion_db -c "SELECT count(*) FROM tasks;"

# Run a SQL file
docker exec -i notion_postgres \
  psql -U notion_user -d notion_db < /seed/001_schema.sql

# Run a query and get CSV output
docker exec -it notion_postgres \
  psql -U notion_user -d notion_db -A -F',' -c "SELECT * FROM tasks LIMIT 5;"

# List databases (non-interactive)
docker exec notion_postgres \
  psql -U notion_user -d notion_db -c "\l"

# Check connection health
docker exec notion_postgres \
  pg_isready -U notion_user -d notion_db
```

---

## Data types (the important ones)

| Type | What it's for | Example |
|---|---|---|
| `TEXT` | Any-length string | `'hello world'` |
| `VARCHAR(n)` | String with max length | `'abc'` |
| `INTEGER` / `INT` | 32-bit integer | `42` |
| `BIGINT` | 64-bit integer | `9223372036854775807` |
| `SERIAL` | Auto-incrementing int | (auto) |
| `BOOLEAN` | true/false | `TRUE` / `FALSE` |
| `NUMERIC(p,s)` | Exact decimal | `99.99` |
| `REAL` / `FLOAT4` | 32-bit float | `3.14` |
| `TIMESTAMP` | Date + time (no tz) | `'2026-04-05 12:00:00'` |
| `TIMESTAMPTZ` | Date + time + timezone | `NOW()` |
| `DATE` | Date only | `'2026-04-05'` |
| `JSON` | JSON (stored as text) | `'{"key": "val"}'` |
| `JSONB` | JSON (binary, indexable!) | `'{"key": "val"}'` |
| `UUID` | Universally unique ID | `gen_random_uuid()` |
| `TEXT[]` | Array of text | `ARRAY['a','b','c']` |

**Pro tip**: Always use `JSONB` over `JSON`. It's faster for queries, supports indexes,
and the storage overhead is negligible.

---

## DDL — creating & altering tables

```sql
-- Create a table
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  status      TEXT DEFAULT 'todo',
  priority    INTEGER DEFAULT 0,
  assignee    TEXT,
  tags        TEXT[] DEFAULT '{}',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add a column
ALTER TABLE tasks ADD COLUMN deadline DATE;

-- Rename a column
ALTER TABLE tasks RENAME COLUMN deadline TO due_date;

-- Change column type
ALTER TABLE tasks ALTER COLUMN priority TYPE TEXT;

-- Set a default
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'backlog';

-- Drop a column
ALTER TABLE tasks DROP COLUMN IF EXISTS due_date;

-- Rename a table
ALTER TABLE tasks RENAME TO task_items;

-- Drop a table
DROP TABLE IF EXISTS task_items CASCADE;

-- Create a table from a query
CREATE TABLE done_tasks AS
  SELECT * FROM tasks WHERE status = 'done';
```

---

## CRUD operations

### Create (INSERT)

```sql
-- Insert one row
INSERT INTO tasks (title, status, priority, assignee)
VALUES ('Fix login bug', 'todo', 1, 'alice');

-- Insert multiple rows
INSERT INTO tasks (title, status, priority) VALUES
  ('Write tests',  'in_progress', 2),
  ('Update docs',  'todo',        3),
  ('Deploy v2',    'todo',        1);

-- Insert and return the new row
INSERT INTO tasks (title, status)
VALUES ('New task', 'todo')
RETURNING *;

-- Insert or do nothing on conflict (upsert)
INSERT INTO tasks (id, title, status)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Upserted', 'todo')
ON CONFLICT (id) DO NOTHING;

-- Insert or update on conflict
INSERT INTO tasks (id, title, status)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Upserted', 'done')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  updated_at = NOW();
```

### Read (SELECT)

```sql
-- Select all
SELECT * FROM tasks;

-- Select specific columns
SELECT title, status, priority FROM tasks;

-- With a filter
SELECT * FROM tasks WHERE status = 'todo';

-- Limit and offset (pagination)
SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10 OFFSET 20;

-- Count rows
SELECT COUNT(*) FROM tasks;
SELECT COUNT(*) FROM tasks WHERE status = 'todo';

-- Distinct values
SELECT DISTINCT status FROM tasks;
SELECT COUNT(DISTINCT assignee) FROM tasks;

-- Aliasing
SELECT title AS task_name, priority AS prio FROM tasks;

-- Check if exists
SELECT EXISTS(SELECT 1 FROM tasks WHERE priority = 1);
```

### Update

```sql
-- Update matching rows
UPDATE tasks SET status = 'done', updated_at = NOW()
WHERE title = 'Fix login bug';

-- Update and return changed rows
UPDATE tasks SET priority = priority + 1
WHERE status = 'todo'
RETURNING id, title, priority;

-- Update all rows (careful!)
UPDATE tasks SET status = 'backlog';

-- Conditional update
UPDATE tasks SET status = CASE
  WHEN priority <= 1 THEN 'urgent'
  WHEN priority <= 3 THEN 'normal'
  ELSE 'low'
END;
```

### Delete

```sql
-- Delete matching rows
DELETE FROM tasks WHERE status = 'archived';

-- Delete and return what was removed
DELETE FROM tasks WHERE status = 'done' RETURNING *;

-- Delete all rows (keeps table structure)
DELETE FROM tasks;

-- Truncate (faster than DELETE for all rows, resets sequences)
TRUNCATE tasks RESTART IDENTITY;

-- Drop a table entirely
DROP TABLE IF EXISTS tasks CASCADE;
```

---

## Querying & filtering

### Comparison & logic

```sql
-- Comparison operators: =, <>, !=, <, >, <=, >=
SELECT * FROM tasks WHERE priority > 2;
SELECT * FROM tasks WHERE status <> 'done';

-- AND / OR
SELECT * FROM tasks WHERE status = 'todo' AND priority <= 2;
SELECT * FROM tasks WHERE status = 'todo' OR status = 'in_progress';

-- IN
SELECT * FROM tasks WHERE status IN ('todo', 'in_progress', 'blocked');

-- NOT IN
SELECT * FROM tasks WHERE status NOT IN ('done', 'archived');

-- BETWEEN (inclusive)
SELECT * FROM tasks WHERE priority BETWEEN 1 AND 3;

-- IS NULL / IS NOT NULL
SELECT * FROM tasks WHERE assignee IS NULL;
SELECT * FROM tasks WHERE assignee IS NOT NULL;

-- LIKE (pattern matching, case-sensitive)
SELECT * FROM tasks WHERE title LIKE '%bug%';
SELECT * FROM tasks WHERE title LIKE 'Fix%';

-- ILIKE (case-insensitive LIKE — PostgreSQL extension)
SELECT * FROM tasks WHERE title ILIKE '%BUG%';

-- Regex
SELECT * FROM tasks WHERE title ~ '^Fix';      -- case-sensitive
SELECT * FROM tasks WHERE title ~* '^fix';     -- case-insensitive
```

### Array operations

```sql
-- Array contains a value
SELECT * FROM tasks WHERE 'bug' = ANY(tags);

-- Array contains ALL of these
SELECT * FROM tasks WHERE tags @> ARRAY['bug', 'auth'];

-- Array overlaps with (has any of)
SELECT * FROM tasks WHERE tags && ARRAY['bug', 'feature'];

-- Array length
SELECT title, array_length(tags, 1) AS tag_count FROM tasks;

-- Unnest array (one row per element)
SELECT title, unnest(tags) AS tag FROM tasks;
```

### JSONB operations

```sql
-- Access a key (returns JSON)
SELECT metadata->'version' FROM tasks;

-- Access a key (returns text)
SELECT metadata->>'version' FROM tasks;

-- Nested access
SELECT metadata->'config'->>'theme' FROM tasks;

-- Filter by JSONB field
SELECT * FROM tasks WHERE metadata->>'version' = '2';

-- JSONB contains
SELECT * FROM tasks WHERE metadata @> '{"active": true}';

-- Check key exists
SELECT * FROM tasks WHERE metadata ? 'version';

-- Update a JSONB field (immutable operation — returns new JSONB)
UPDATE tasks SET metadata = metadata || '{"reviewed": true}'
WHERE id = '...';

-- Remove a key from JSONB
UPDATE tasks SET metadata = metadata - 'temporary_key';
```

---

## Joins

```sql
-- Inner join (only matching rows from both tables)
SELECT t.title, c.name AS assignee_name
FROM tasks t
INNER JOIN contacts c ON t.assignee = c.name;

-- Left join (all rows from left table, NULLs for non-matching right)
SELECT t.title, c.name AS assignee_name
FROM tasks t
LEFT JOIN contacts c ON t.assignee = c.name;

-- Right join (opposite of left join)
SELECT t.title, c.name
FROM tasks t
RIGHT JOIN contacts c ON t.assignee = c.name;

-- Full outer join (all rows from both tables)
SELECT t.title, c.name
FROM tasks t
FULL OUTER JOIN contacts c ON t.assignee = c.name;

-- Cross join (every combination — careful with large tables)
SELECT t.title, c.name
FROM tasks t
CROSS JOIN contacts c;

-- Self-join (relate a table to itself)
SELECT a.title AS task, b.title AS blocks
FROM tasks a
JOIN tasks b ON a.blocked_by = b.id;

-- Multi-table join
SELECT t.title, c.name, p.name AS project
FROM tasks t
JOIN contacts c ON t.assignee = c.name
JOIN projects p ON t.project_id = p.id;
```

---

## Aggregation & grouping

```sql
-- Count per status
SELECT status, COUNT(*) AS cnt
FROM tasks
GROUP BY status
ORDER BY cnt DESC;

-- Aggregate functions
SELECT
  COUNT(*)           AS total,
  COUNT(assignee)    AS assigned,
  MIN(priority)      AS min_prio,
  MAX(priority)      AS max_prio,
  AVG(priority)      AS avg_prio,
  SUM(priority)      AS sum_prio
FROM tasks;

-- HAVING (filter after grouping)
SELECT assignee, COUNT(*) AS task_count
FROM tasks
GROUP BY assignee
HAVING COUNT(*) > 5
ORDER BY task_count DESC;

-- String aggregation
SELECT status, STRING_AGG(title, ', ') AS titles
FROM tasks
GROUP BY status;

-- Array aggregation
SELECT assignee, ARRAY_AGG(DISTINCT status) AS statuses
FROM tasks
GROUP BY assignee;

-- Window functions (rank without collapsing rows)
SELECT title, status, priority,
  ROW_NUMBER() OVER (PARTITION BY status ORDER BY priority) AS rank
FROM tasks;

-- Running total
SELECT title, priority,
  SUM(priority) OVER (ORDER BY created_at) AS running_total
FROM tasks;
```

---

## Indexes

Indexes are what make PostgreSQL fast. Without them, every query is a sequential scan.

```sql
-- Create a basic index
CREATE INDEX idx_tasks_status ON tasks(status);

-- Create a composite index (column order matters for queries)
CREATE INDEX idx_tasks_status_priority ON tasks(status, priority);

-- Create a unique index
CREATE UNIQUE INDEX idx_contacts_email ON contacts(email);

-- Create a partial index (only index rows matching a condition)
CREATE INDEX idx_active_tasks ON tasks(status)
WHERE status NOT IN ('done', 'archived');

-- Create a GIN index on JSONB (for @>, ?, ?| operators)
CREATE INDEX idx_tasks_metadata ON tasks USING GIN(metadata);

-- Create a GIN index on an array column
CREATE INDEX idx_tasks_tags ON tasks USING GIN(tags);

-- Create a GiST index on text (for trigram similarity/search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_tasks_title_trgm ON tasks USING GIN(title gin_trgm_ops);

-- Show all indexes on a table
\di+ tasks

-- Show index usage stats
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE relname = 'tasks';

-- Drop an index
DROP INDEX IF EXISTS idx_tasks_status;

-- Check if a query uses an index
EXPLAIN ANALYZE SELECT * FROM tasks WHERE status = 'todo';
-- Look for "Index Scan" (good) vs "Seq Scan" (bad)
```

---

## Transactions

```sql
-- Basic transaction
BEGIN;
  UPDATE tasks SET status = 'in_progress' WHERE id = '...';
  INSERT INTO history (task_id, action) VALUES ('...', 'started');
COMMIT;

-- Rollback on error
BEGIN;
  UPDATE tasks SET assignee = 'bob' WHERE id = '...';
  -- Oops, wrong task
ROLLBACK;

-- Savepoints (partial rollback)
BEGIN;
  UPDATE tasks SET status = 'done' WHERE id = 'a';
  SAVEPOINT sp1;
  UPDATE tasks SET status = 'done' WHERE id = 'b';
  ROLLBACK TO sp1;  -- undo only task b
  COMMIT;           -- task a is still committed
```

---

## Import / Export

```bash
# Export a table to CSV
docker exec -it notion_postgres \
  psql -U notion_user -d notion_db \
  -c "\COPY tasks TO STDOUT WITH CSV HEADER" > tasks.csv

# Import CSV into a table
docker exec -i notion_postgres \
  psql -U notion_user -d notion_db \
  -c "\COPY tasks(title,status,priority) FROM STDIN WITH CSV HEADER" < tasks.csv

# Dump entire database (SQL format)
docker exec notion_postgres \
  pg_dump -U notion_user -d notion_db > backup.sql

# Dump in custom format (compressed, supports parallel restore)
docker exec notion_postgres \
  pg_dump -U notion_user -d notion_db -Fc > backup.dump

# Dump only schema (no data)
docker exec notion_postgres \
  pg_dump -U notion_user -d notion_db --schema-only > schema.sql

# Dump only data (no schema)
docker exec notion_postgres \
  pg_dump -U notion_user -d notion_db --data-only > data.sql

# Dump a single table
docker exec notion_postgres \
  pg_dump -U notion_user -d notion_db -t tasks > tasks.sql

# Restore from SQL dump
docker exec -i notion_postgres \
  psql -U notion_user -d notion_db < backup.sql

# Restore from custom format
docker exec -i notion_postgres \
  pg_restore -U notion_user -d notion_db --clean backup.dump
```

### Using our Makefile

```bash
# Seed PostgreSQL with schema + data
make -C src seed-pg

# Verify tables have data
make -C src verify-pg
```

---

## Administration

```sql
-- Show current connections
SELECT pid, usename, application_name, client_addr, state, query
FROM pg_stat_activity
WHERE datname = current_database();

-- Kill a stuck query
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active' AND query LIKE '%stuck_query%';

-- Show table sizes
SELECT tablename,
  pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) AS total_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(quote_ident(tablename)) DESC;

-- Show database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Show cache hit ratio (should be > 99%)
SELECT
  sum(heap_blks_hit) * 100.0 / sum(heap_blks_hit + heap_blks_read) AS cache_hit_ratio
FROM pg_statio_user_tables;

-- Analyze tables (update query planner statistics)
ANALYZE;

-- Vacuum (reclaim dead row space)
VACUUM ANALYZE;

-- Check for long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC
LIMIT 5;

-- Show unused indexes
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Docker-specific

```bash
# View PostgreSQL container logs
docker logs -f notion_postgres

# Restart PostgreSQL
docker restart notion_postgres

# Check container health
docker inspect --format='{{.State.Health.Status}}' notion_postgres

# Check pg_isready
docker exec notion_postgres pg_isready -U notion_user

# Open a raw shell in the container
docker exec -it notion_postgres bash

# Check disk usage of data directory
docker exec notion_postgres du -sh /var/lib/postgresql/data
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `FATAL: password authentication failed` | Check user/password in `.env`. Default: `notion_user` / `notion_pass`. |
| `FATAL: database "xxx" does not exist` | The database wasn't created. Check `docker/init-databases.sql` or create it: `CREATE DATABASE xxx;` |
| `ECONNREFUSED 127.0.0.1:5432` | Container not running. `docker compose --profile src up -d postgres`. |
| `could not connect to server: Connection refused` | Same as above — or port 5432 is already in use on your host. |
| Table exists but is empty | Seed data wasn't loaded. Run `make -C src seed-pg`. |
| `Seq Scan` on everything | Missing indexes. Run `EXPLAIN ANALYZE` on your query and add the right index. |
| Disk full | `VACUUM FULL;` to reclaim space, or `docker system prune --volumes`. |
| Data gone after `make build` | Expected — `make build` wipes volumes for a clean state. Use `make dev` for persistence. |
| Slow queries | Check `EXPLAIN ANALYZE`, add indexes, or increase `work_mem` in `postgresql.conf`. |

---

*Last updated: April 2026*
