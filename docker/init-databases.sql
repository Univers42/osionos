-- Creates per-context databases if they don't exist.
-- Docker's POSTGRES_DB creates `osionos_db`; we also need src & playground DBs.

SELECT 'CREATE DATABASE osionos_src_db OWNER osionos_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'osionos_src_db')\gexec
