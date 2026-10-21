-- The fixture of the throwaway stacks: the roles the AI migrations grant to
-- (service_role) and revoke from (anon, authenticated), the two tables the AI
-- service reads, and the two functions of the page search.
--
-- It is applied by the shared harness (eval/harness.sh), so the test suite
-- (scripts/test.sh) and the golden-set runner (eval/run.sh) run against the
-- SAME database shape and the SQL is written here, once.

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
	if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$$;

-- TEST-ONLY FIXTURE: the columns of osionos_workspace_members that
-- canAccessWorkspace reads. The production table (models/osionos-bridge-migration.sql)
-- carries created_at/updated_at and a foreign key to osionos_workspaces as well; this
-- fixture holds the same column types and nothing more.
create table if not exists public.osionos_workspace_members (
	workspace_id uuid not null,
	user_id uuid not null,
	role text not null,
	permissions text[] not null default array['read'],
	primary key (workspace_id, user_id)
);

-- TEST-ONLY FIXTURE: the columns of osionos_pages that the page context of a
-- run reads (src/pageContext.ts), the columns the RAG triggers read (the
-- enqueue trigger, the ACL sync trigger and the delete trigger of
-- models/osionos-ai-rag-migration.sql) AND the columns the golden-set seed
-- writes (eval/seed.mjs): id, workspace_id, parent_page_id, owner_id, title,
-- icon, database_id, surface, visibility, collaborators, properties, content,
-- archived_at, created_at, updated_at. The production table
-- (models/osionos-bridge-migration.sql) carries many more; this fixture holds
-- the same column types and nothing more.
--
-- The visibility is nullable here, while the production column is NOT NULL:
-- the read rule handles a NULL visibility (it is 'private'), and the table of
-- the ACL agreement has to cover it.
create table if not exists public.osionos_pages (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null,
	parent_page_id uuid,
	owner_id uuid,
	title text not null default 'Untitled',
	icon text,
	database_id text,
	surface text,
	visibility text default 'private',
	collaborators jsonb not null default '[]'::jsonb,
	properties jsonb not null default '[]'::jsonb,
	content jsonb not null default '[]'::jsonb,
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- TEST-ONLY FIXTURE: the block walker of the pages, copied verbatim from
-- models/osionos-page-search-migration.sql, so the real SQL of the page
-- context runs against the fixture.
CREATE OR REPLACE FUNCTION public.osionos_page_blocks(doc jsonb)
RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  WITH RECURSIVE walk(b) AS (
    SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(doc) = 'array' THEN doc ELSE '[]'::jsonb END)
    UNION ALL
    SELECT jsonb_array_elements(w.b -> 'children')
    FROM walk w
    WHERE jsonb_typeof(w.b -> 'children') = 'array'
  )
  SELECT b FROM walk
$$;

-- TEST-ONLY FIXTURE: the text projection of a page, copied verbatim from
-- models/osionos-page-search-migration.sql.
CREATE OR REPLACE FUNCTION public.osionos_page_text(doc jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(string_agg(b ->> 'content', ' '), '')
  FROM public.osionos_page_blocks(doc) AS b
  WHERE b ? 'content'
$$;
