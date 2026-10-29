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

-- TEST-ONLY FIXTURE: the columns of osionos_workspaces that the approval card
-- reads (the name of the workspace a write lands in). The production table
-- (models/osionos-bridge-migration.sql) carries more; this fixture holds the
-- same column types and nothing more.
create table if not exists public.osionos_workspaces (
	id uuid primary key default gen_random_uuid(),
	owner_id uuid not null,
	name text not null default 'Workspace',
	slug text,
	visibility text not null default 'confidential'
);

-- TEST-ONLY FIXTURE: the private workspace rows of the three test users
-- (tests/retrievalSeed.ts: WORKSPACE_A is USER_A's, B is B's, C is C's). In
-- production the bridge writes this row when it creates a private workspace, and
-- the share-rule read path (src/retrieval/shareRules.ts) takes the owner from it:
-- without the row the owner is a non-member and every page of theirs is closed.
insert into public.osionos_workspaces (id, owner_id, name) values
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Workspace A'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Workspace B'),
	('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'Workspace C')
on conflict (id) do nothing;

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

-- TEST-ONLY FIXTURE: the columns of osionos_share_rules that the AI read path
-- reads (src/retrieval/shareRules.ts). Without the table every workspace would
-- fail closed and the retrieval tests would see no page at all. The production
-- table (models/osionos-share-rules-migration.sql) carries target_key, the
-- identity constraint and the CHECKs; this fixture holds the same column types.
create table if not exists public.osionos_share_rules (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null,
	resource_type text not null default 'page',
	resource_id text not null default '',
	target jsonb not null,
	permission text not null,
	explicit boolean not null default true,
	created_at timestamptz not null default now()
);

-- TEST-ONLY FIXTURE: the link store of the graph (C103). The production table
-- (models/osionos-page-links-migration.sql) carries a foreign key on the source
-- page and the trigger that fills it from the block content; this fixture holds
-- the same columns and nothing more, so the graph's edge read runs against it.
create table if not exists public.osionos_page_links (
	source_page_id uuid not null,
	target_page_id uuid not null,
	owner_id uuid,
	workspace_id uuid not null,
	primary key (source_page_id, target_page_id)
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

-- TEST-ONLY FIXTURE: the two comment tables the moderation migration adds its
-- state column to and its enqueue triggers to
-- (models/osionos-ugc-moderation-migration.sql). The production tables
-- (osionos-chat-migration.sql, osionos-comments-migration.sql,
-- osionos-feed-engagement-migration.sql) carry foreign keys and more columns;
-- this fixture holds the columns the triggers and the L1 handler read.
create table if not exists public.osionos_feed_comments (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null,
	author_id uuid not null,
	content text not null,
	created_at timestamptz not null default now()
);

create table if not exists public.osionos_page_comments (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null,
	author_id uuid not null,
	content text not null,
	created_at timestamptz not null default now()
);

-- TEST-ONLY FIXTURE: the chat tables the thread-answers migration alters and
-- reads (models/osionos-ai-thread-answers-migration.sql). The production
-- tables (osionos-chat-migration.sql, osionos-thread-migration.sql,
-- osionos-reply-migration.sql) carry foreign keys and more columns; this
-- fixture holds the columns osionos_ai_channel_context reads.
create table if not exists public.osionos_channels (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null,
	kind text not null default 'text' check (kind in ('text', 'dm', 'voice', 'video')),
	name text not null default 'general',
	is_private boolean not null default false
);

create table if not exists public.osionos_channel_members (
	channel_id uuid not null,
	user_id uuid not null,
	role text not null default 'member',
	primary key (channel_id, user_id)
);

create table if not exists public.osionos_messages (
	id uuid primary key default gen_random_uuid(),
	channel_id uuid not null,
	author_id uuid not null,
	content text not null default '',
	created_at timestamptz not null default now(),
	deleted_at timestamptz,
	thread_root_id uuid
);
