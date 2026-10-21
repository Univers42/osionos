# osionos-ai

The AI assistant of osionos: a stateless Node service, separate from the
single-process bridge. It carries the bridge's `osionos_v1` app-session tokens
(scripts/bridge-session-token.mjs), the workspace-access rule, conversations, and
the runs: a run takes the user's message, calls one OpenAI-compatible upstream
through the Vercel AI SDK, streams the answer over SSE, and keeps every event in
a Redis Stream, so a client that reconnects resumes the run on any replica.

## Routes

| Route | Auth | Answer |
| --- | --- | --- |
| `GET /api/ai/health` | no | `{ ok, db, redis }`, each check under a second |
| `POST /api/ai/conversations` | yes | 201 with the row, 404 when the workspace is not accessible |
| `GET /api/ai/conversations?workspaceId=<uuid>` | yes | the caller's own conversations, newest first |
| `GET /api/ai/conversations/:id/messages` | yes | 404 unless the caller owns the conversation |
| `POST /api/ai/runs` | yes | SSE: `run.started`, `text.delta`, `reasoning.delta`, `usage`, `done` or `error` |
| `GET /api/ai/runs/:id/events` | yes | SSE: the events after `Last-Event-ID`, then the live ones |
| `POST /api/ai/runs/:id/cancel` | yes | 202; the run stops wherever it runs |
| `GET /api/ai/models` | yes | `{ models: [{ id, label, default }] }`, never a price |
| `GET /api/ai/commands?surface=editor\|chat` | yes | `{ commands: Command[] }`, the built-ins of that surface |
| `POST /api/ai/complete` | yes | SSE: `text.delta`, `usage`, `done` or `error`, nothing persisted |

A run that is asked again with the same `runId` re-attaches to its stream: the
events are replayed and no model is called a second time. A client that
disconnects does NOT cancel a run: it keeps going and stays resumable. Only
`POST /runs/:id/cancel` stops it.

## The commands

The ten built-ins live in the code (`src/commands/builtins.ts`), frozen: a
command is a name, a description, a template with `$ARGUMENTS` in it, and a
surface (`editor`, `chat`, or `both`). `GET /commands?surface=…` answers the
commands of that surface.

`POST /api/ai/complete` runs one of them on the selection of the editor: the
input is wrapped in `<selection>`, the template is rendered around it, and the
answer streams straight back. Nothing is persisted — no conversation, no run
row, no stream in Redis — so `done.assistantMessageId` is always `null`. The
client that goes away aborts the upstream call, and the budget is settled with
what the upstream reported.

## The pages of a run

`POST /api/ai/runs` takes `context: { pageIds: uuid[] }` (at most three). The
server reads the pages in one query and re-checks the access of every one with
the bridge's own rule (`canReadPageRowAsMember`, scripts/bridge-page-read.mjs):
a page the caller may not read is skipped, never refused, and its id comes back
in `run.started.skippedPageIds`. The pages that pass are quoted in the prompt
as `<page id="…" title="…">…</page>` blocks, before the question.

## The search of a workspace

`context: { workspace: true }` asks for more: the caller's own workspaces are
searched, and the run quotes what it found.

One statement does the whole search (`src/retrieval/search.ts`): the lexical
half (the tsvector of the chunk) and the vector half (its embedding) are read
side by side — the fifty best of each — and the two lists are fused with RRF
(reciprocal rank fusion, `Σ 1/(60 + rank)`). The twenty best chunks of the
fusion go to the model, at most three of them of the same page.

The permission predicate (`src/retrieval/acl.ts`) filters both halves: it is
the exact twin of `canReadPageRowAsMember`, read over the copy of the
permissions the index stores with the chunks (the normalized visibility, the
ids of the collaborators that carry a role). It is only a pre-filter: every
page that comes out of the search is checked AGAIN with the bridge's own
function, so a stale copy of the permissions can never leak a page. The
workspaces of the caller are read live, from the token and from
`osionos_workspace_members`: a membership that ends ends at once.

The sources of the answer are sent as `citation` events, one per source, after
`run.started` and before the first `text.delta`, and they are kept with the
assistant message as `citation` parts, in the same order. The answer cites them
as `[n]`, and the prompt says what they are: workspace data, never
instructions.

A search that fails (the embedding service is down) is not a failure of the
run: the run goes on without sources, `run.started.retrievedCount` is 0, and
the failure is logged once.

The search needs the embedding service of the deployment — the same one the
indexer writes its vectors with (`OSIONOS_AI_EMBED_URL`). Without it the
service has no search: the runs go on without sources.

## The keys of Redis

| Key | What it holds | TTL |
| --- | --- | --- |
| `ai:run:<runId>` | the events of a run (a stream, `MAXLEN ~ 2000`) | 900 s |
| `ai:rl:<userId>:<minute>` | the runs of a user in a minute | 70 s |
| `ai:cancel` | the channel a cancellation travels on | — |

Every key carries a TTL: the shared Redis evicts `volatile-lru` at 384 MB, and a
key without a TTL could never be evicted.

## The money

The budget is reserved BEFORE the upstream is called, and settled after it. The
reservation is `estimated input tokens × input price + max output tokens × output
price`, on the user AND on the platform, in one transaction: either both move or
neither does. The estimate counts four characters per token, which under-counts
CJK and code-heavy text; the settlement corrects it with the usage the upstream
reports. A refused reservation is a 402 `budget_exhausted`, and the run is
failed, so the next one may start.

## The indexer

The RAG index has its own process: the same image, another entrypoint.

    pnpm --filter @osionos/ai-service indexer

It listens on `ai_index` and takes the dirty pages of `ai_index_queue` every
five seconds. A page is cut into sections at its headings (`heading_1` to
`heading_3`), and every section into chunks of about 300 to 500 tokens
(`ceil(chars / 4)`; the real limit of the model is enforced by the embedding
service, which truncates). The chunks are embedded by the LOCAL service
(`OSIONOS_AI_EMBED_BULK_URL`, a text-embeddings-inference of its own; it
falls back to `OSIONOS_AI_EMBED_URL`, the one the search asks) and written to
`ai_chunks` with the ACL of the page.

The bulk work and the queries of the people want two different things from an
embedding service: a backfill fills it with calls of thirty-two inputs, and a
query that lands during one waits for the whole call (the p95 of an
interactive query embedding goes from 147 ms to 864 ms during a backfill —
`services/osionos-ai/spikes/indexer/RESULTS.md`). So the deployment may run
TWO instances of the same model, one for the queries
(`OSIONOS_AI_EMBED_URL`) and one for the bulk (`OSIONOS_AI_EMBED_BULK_URL`),
and the CPU is split between them. The indexer asks the bulk one when it is
set, and the query one otherwise: an operator who sets nothing keeps the
service it had.

Only the chunks whose hash changed are embedded again: a chunk that kept its
hash keeps its vector, even when it moved in the page. A renamed heading
gives another hash — the heading path is in it — so its chunks are embedded
again.

Several replicas may run it at the same time: the queue is claimed with
`FOR UPDATE SKIP LOCKED`, and every page is taken with an advisory lock. The
queue ROW is not held while a page is indexed, so an edit that lands in the
meantime bumps `dirty_at`, the last delete leaves the row alone, and the page
is indexed again.

The permissions of the page are read AGAIN, under a row lock (`FOR SHARE`),
just before its chunks are written. The queue does not re-index a page whose
visibility only changed, so a page made private while it was being embedded
must not be written back with the old visibility: the copy that answers a
search has to be the one the page has now. An update that comes later waits
for the write, and its trigger then puts the new permissions on the new
chunks.

A failure (the embedding service is down, a page is broken) counts an attempt
and pushes the next try: 2, 4, 8… seconds, ten minutes at most. After ten
attempts the page is left alone, and logged once.

`OSIONOS_AI_EMBED_BULK_URL` (the embedding service of the bulk work; it
falls back to `OSIONOS_AI_EMBED_URL`) and `OSIONOS_AI_EMBED_MODEL`
(`intfloat/multilingual-e5-small`) are the variables of the indexer that name
its embedding service.

## Environment

Required: `OSIONOS_AI_DATABASE_URL`, `OSIONOS_AI_REDIS_URL`,
`OSIONOS_APP_SESSION_SECRET`, `OSIONOS_AI_UPSTREAM_BASE_URL` (the OpenAI-compatible
upstream, e.g. `https://openrouter.ai/api/v1`), `OSIONOS_AI_PLATFORM_MODELS` (the
JSON allowlist: `[{"id","label","inputMicroUsdPerMTok","outputMicroUsdPerMTok","default"?}]`,
exactly one default).
Optional: `OSIONOS_AI_PORT` (4300), `OSIONOS_ALLOWED_ORIGIN` (the app URL),
`OSIONOS_APP_SESSION_TTL_SECONDS` (3600), `OSIONOS_BAAS_URL` and `SERVICE_ROLE_KEY`
(the bridge's names — the session-cutoff poller reads them), `OSIONOS_SESSION_CUTOFFS`
(`off` turns the cut-off check off), `OSIONOS_AI_UPSTREAM_API_KEY` (a local runtime
needs none), `OSIONOS_AI_MAX_OUTPUT_TOKENS` (1024), `OSIONOS_AI_USER_DAILY_MICROUSD`
(200000), `OSIONOS_AI_PLATFORM_DAILY_MICROUSD` (20000000), `OSIONOS_AI_RUNS_PER_MINUTE`
(20), `OSIONOS_AI_EMBED_URL` and `OSIONOS_AI_EMBED_MODEL`
(`intfloat/multilingual-e5-small`) — the embedding service of the search of a
workspace, the one the indexer writes its vectors with too when it has no
bulk service of its own; without it the service has no search. A missing or
broken variable stops the service and names the variable, never its value.

The indexer reads `OSIONOS_AI_DATABASE_URL`, `OSIONOS_AI_EMBED_BULK_URL`
(`OSIONOS_AI_EMBED_URL` when the bulk one is not set) and
`OSIONOS_AI_EMBED_MODEL` (`intfloat/multilingual-e5-small`).

## The type check

The service imports the bridge's own modules — `scripts/bridge-session-token.mjs`,
`scripts/bridge-session-cutoff.mjs`, `scripts/bridge-page-read.mjs` — so the type
check has to see the whole repository, not the service alone:

    docker run --rm -v "$PWD":/app -w /app/services/osionos-ai node:22-bookworm-slim node_modules/.bin/tsc --noEmit -p tsconfig.json

Mounting only `services/osionos-ai` hides those three modules from `tsc`: the
imports fall back to ambient declarations that nothing checks, and the gate
passes whatever the bridge does. That file is gone; each bridge module now
carries the JSDoc types of what it exports, in the module that owns the
behaviour, and this command checks the service against the real ones.

`allowJs` stays on: `eval/*.ts` imports `./lib.mjs` and `./text.mjs`.

## Tests

    sh services/osionos-ai/scripts/test.sh /path/to/osionos-ai-migration.sql [/path/to/osionos-ai-rag-migration.sql]

The migrations are applied in the order they are given; the RAG migration (the
chunks and the queue) is a second one.

Throwaway `pgvector/pgvector:0.8.0-pg16` and `redis:7.4-alpine` containers on a private network; both are removed when the script exits. The suite runs a mock upstream (`tests/mockUpstream.ts`) and points the service at it, and a mock embedding service (`tests/mockEmbed.ts`) for the indexer.
