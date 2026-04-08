-- Creates per-context databases if they don't exist.
-- Docker's POSTGRES_DB creates `notion_db`; we also need src & playground DBs.

SELECT 'CREATE DATABASE notion_src_db OWNER notion_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notion_src_db')\gexec
