-- AI-P0b spike schema — hybrid retrieval (FTS + pgvector) + index-queue.
-- Throwaway: runs only inside the `ai-spike-pg` container. Nothing here is production DDL.
--
-- ---------------------------------------------------------------------------
-- Access predicate, mirrored from the JS source of truth
--   scripts/bridge-page-read.mjs
-- ---------------------------------------------------------------------------
-- A chunk is readable by `user` iff its workspace is one of that user's member
-- workspaces AND the page is readable by a member of that workspace:
--
--   canReadPageRowAsMember (l.66-68):
--     [...memberWorkspaceIds].some((workspaceId) => sameId(workspaceId, row?.workspace_id))
--       && canReadPageRow(row, userId)
--   canReadPageRow (l.57-58):
--     pageVisibility(row?.visibility) === 'shared' || canReadAsNonMember(row, userId)
--   canReadAsNonMember (l.52-53):
--     pageVisibility(row?.visibility) === 'public' || isOwnerOrCollaborator(row, userId)
--   isOwnerOrCollaborator (l.47-49): isPageOwner (l.37-38: sameId(row.owner_id, userId))
--                                    || isPageCollaborator (l.41-43: a collaborator entry whose .userId matches)
--   pageVisibility (l.27-29): anything not in {'private','shared','public'} — including null — is 'private'
--   sameId (l.33-35): case-insensitive uuid compare (Postgres uuid equality already is)
--
-- The JS `collaborators` array holds {userId, role} objects; this spike flattens
-- it to a plain `collaborator_ids uuid[]`, so "is a collaborator" is `user = ANY(collaborator_ids)`.
-- In SQL the whole thing becomes (see queries.sql for the inlined form):
--
--   workspace_id = ANY ($ws)                          -- memberWorkspacesIds gate (l.66-67)
--     AND ( visibility = 'shared'                     -- l.58 'shared'
--        OR visibility = 'public'                     -- l.53 'public' / l.58
--        OR owner_id = $user                          -- l.37-38
--        OR $user = ANY (collaborator_ids) )          -- l.41-43
--
-- Notes on NULL: `visibility = 'shared'` is NULL (not true) when visibility is
-- NULL, and no branch reads an unknown visibility text, so null/unknown -> private,
-- exactly like pageVisibility (l.27-29).
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

-- Workspace membership: (workspace, user) pairs. A user may appear in several workspaces.
CREATE TABLE members (
    workspace_id uuid NOT NULL,
    user_id      uuid NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

-- Vector + lexical payload, hash-partitioned by workspace (16 partitions) so the
-- member-workspace array can prune at plan time.
CREATE TABLE ai_chunks (
    id               bigint GENERATED ALWAYS AS IDENTITY,
    workspace_id     uuid NOT NULL,
    page_id          uuid NOT NULL,
    owner_id         uuid,
    visibility       text,
    collaborator_ids uuid[] NOT NULL DEFAULT '{}',
    heading_path     text,
    content          text NOT NULL,
    tsv              tsvector GENERATED ALWAYS AS
                       (to_tsvector('simple', coalesce(heading_path, '') || ' ' || content)) STORED,
    embedding        halfvec(384) NOT NULL,
    PRIMARY KEY (workspace_id, id)
) PARTITION BY HASH (workspace_id);

CREATE TABLE ai_chunks_p00 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE ai_chunks_p01 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE ai_chunks_p02 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE ai_chunks_p03 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE ai_chunks_p04 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE ai_chunks_p05 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE ai_chunks_p06 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE ai_chunks_p07 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE ai_chunks_p08 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE ai_chunks_p09 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE ai_chunks_p10 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE ai_chunks_p11 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE ai_chunks_p12 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE ai_chunks_p13 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE ai_chunks_p14 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE ai_chunks_p15 PARTITION OF ai_chunks FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- NOTE: the three retrieval indexes are created AFTER the load, by index.sql, and timed there.
