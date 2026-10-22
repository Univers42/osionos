# osionos-ai

The AI assistant of osionos: a stateless Node service, separate from the
single-process bridge. It carries the bridge's `osionos_v1` app-session tokens
(scripts/bridge-session-token.mjs), the workspace-access rule, conversations, and
the runs: a run takes the user's message, calls an OpenAI-compatible upstream
through the Vercel AI SDK, streams the answer over SSE, and keeps every event in
a Redis Stream, so a client that reconnects resumes the run on any replica. The
model may call the tools of the assistant while it answers, and the answer comes
after them.

## Routes

| Route | Auth | Answer |
| --- | --- | --- |
| `GET /api/ai/health` | no | `{ ok, db, redis }`, each check under a second |
| `POST /api/ai/conversations` | yes | 201 with the row, 404 when the workspace is not accessible |
| `GET /api/ai/conversations?workspaceId=<uuid>` | yes | the caller's own conversations, newest first |
| `GET /api/ai/conversations/:id/messages` | yes | 404 unless the caller owns the conversation |
| `POST /api/ai/runs` | yes | SSE: `run.started`, `citation`, `tool.called`, `tool.result`, `permission.asked`, `text.delta`, `reasoning.delta`, `usage`, `done` or `error` |
| `GET /api/ai/runs/:id/events` | yes | SSE: the events after `Last-Event-ID`, then the live ones |
| `POST /api/ai/runs/:id/cancel` | yes | 202; the run stops wherever it runs |
| `GET /api/ai/approvals/:id` | yes | the approval of the caller: the tool, the target, the arguments, the preview |
| `POST /api/ai/approvals/:id` | yes | `{ decision: 'approve' \| 'decline' }`; the write happens once, with the token of the request |
| `GET /api/ai/models` | yes | `{ models: [{ id, label, default }] }`, never a price |
| `GET /api/ai/commands?surface=editor\|chat` | yes | `{ commands: Command[] }`, the built-ins of that surface |
| `GET /api/ai/agents` | yes | `[{ id, version, name, description }]`, the built-in agents — never their instructions |
| `POST /api/ai/complete` | yes | SSE: `text.delta`, `usage`, `done` or `error`, nothing persisted |

A run that is asked again with the same `runId` re-attaches to its stream: the
events are replayed and no model is called a second time. A client that
disconnects does NOT cancel a run: it keeps going and stays resumable. Only
`POST /runs/:id/cancel` stops it.

## The commands

The eleven built-ins live in the code (`src/commands/builtins.ts`), frozen: a
command is a name, a description, a template with `$ARGUMENTS` in it, and a
surface (`editor`, `chat`, or `both`). `GET /commands?surface=…` answers the
commands of that surface.

`POST /api/ai/complete` runs one of them on the selection of the editor: the
input is wrapped in `<selection>`, the template is rendered around it, and the
answer streams straight back. Nothing is persisted — no conversation, no run
row, no stream in Redis — so `done.assistantMessageId` is always `null`. The
client that goes away aborts the upstream call, and the budget is settled with
what the upstream reported.

## The agents of a run

An agent is CONFIGURATION over the one runtime: `{ id, version, name,
description, instructions, tools[] }` — one loop, one budget, one permission
model, and three shapes of the assistant. They live in the code
(`src/agents/builtins.ts`), frozen: the Database architect, the Doc writer and
the Analyst. There is no `general` agent: no agent means the general
assistant, and its prompt is the base one, byte for byte.

`POST /api/ai/runs` takes `agentId` — one of the built-ins, or nothing. The
agent adds its instructions to the system prompt, between the style and the
data-boundary line, and that line stays LAST: the rule that quoted data is
data and never an instruction is the last thing the model reads (devil C38).
The run pins the agent and its version on its row (`ai_runs.agent_id`,
`ai_runs.agent_version`), so the answer can be explained later with the exact
instructions it ran under (devil C40). The instructions are capped at 1 500
characters: the prefix of the prompt is what every step pays for (devil C47).

The tools of the run are the agent's list ∩ what the runtime offers: an agent
never gains a tool, and the write tools it keeps stay behind the approval of
the user. `GET /api/ai/agents` answers the list — the id, the version, the name
and the description, NEVER the instructions: they are the text of the server's
prompt.

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

## The tools of the assistant

The model may call tools. Three of them READ: `search_workspace` (the passages
of the caller's workspaces that answer a question), `read_page` (the title
and the text of one page) and `graph_neighbors` (the pages linked to a page:
the ones it links to, the ones that link to it, its parent, its sub-pages, and
the pages most like it). Three of them WRITE: `create_page`, `rename_page`
and `archive_page` — and a write tool never writes: it asks.

They live in one library (`src/tools/`), and a tool is always the same shape: a
name, a description, a schema of arguments, and the work. The model may not call
a tool with arguments the schema does not take.

Three rules the tools carry:

- **The rule of the bridge decides.** A page the caller may not read does not
  exist for them: the tool answers "no page with that id in your workspaces",
  and it never says why. A page of another workspace is not read either, even
  when it is public: the tool is stricter than the app, on purpose.
- **The workspaces are read live**, at the moment of the call, from the token
  and from `osionos_workspace_members`: a membership that ends ends at once. A
  run that quotes no page has the same tools as a run that quotes three.
- **The text of a page is data, never markup.** The result of a tool is quoted
  the way the prompt quotes a page, so a page that writes `</page>` cannot forge
  a page of its own through a tool either.

The read tools hold NO token. The token of the caller is a full-account bearer:
it opens the bridge and it carries the workspaces of the user. A read tool has
no use for it, so it never holds it — and a write tool holds it neither: a
write tool does not write. The token is used by the request that DECIDES an
approval, and by nothing else.

## The write tools, and the approvals

A write tool never writes. It validates its arguments, drops the ones its
schema does not know, stores the rest in an `ai_approvals` row (`pending`),
emits `permission.asked`, and tells the model to stop and wait. The run ends
right there, with the finish reason `awaiting_approval`: the run is terminal,
and the APPROVAL ROW is what waits — so the conversation may carry on while
the question is open.

The write happens when the user decides: `POST /api/ai/approvals/:id` with
`{decision: 'approve'}` or `{decision: 'decline'}` — nothing else in the body.
An approval of somebody else does not exist for the caller: a 404. The claim
is one statement (`update … where status = 'pending'`), so two decisions that
race write ONCE, and the write goes out with the token of THAT request. The
outcome is recorded before the continuation starts: the continuation is a NEW
run in the same conversation, with its own reservation.

Three rules the write tools carry:

- **The arguments are a strict whitelist.** `visibility`, `collaborators`,
  `properties`, the `workspaceId` of a page that exists and `archivedAt` never
  reach the bridge, whatever the model sends: the schema drops them, and the
  body of the bridge is built from the fields the tool owns.
- **The archive is a stamp.** `archive_page` sends `PATCH {archivedAt}`, and
  never a DELETE: a page can be restored. The card counts the sub-pages that
  go with it.
- **The content of a page is not written.** `rename_page` changes the title
  and nothing else; the versioned append of blocks comes later.

The bridge is operator configuration (`OSIONOS_AI_BRIDGE_URL`): no argument
of a tool and no word of a user can move it, and without it the write tools
are not registered at all — the reads keep working.

The event `permission.asked` is the DATA of the card:

    { approvalId, tool, verb, target: { pageId?, title, workspaceId, workspaceName },
      args, preview: { unit, count }, provenance: { pageIds }, approvedInRun, expiresAt }

`GET /api/ai/approvals/:id` answers the same thing, rebuilt from the row: the
card survives the fifteen minutes of the event stream.

The assistant message of the run keeps the approval id of every write it asked
for, as a `permission` part (`{ type: 'permission', approvalId, tool }`). The
transcript is what carries the card when the stream is gone: a client that
comes back later reads the parts, finds the id, and asks the approval row for
the rest.

A run is a loop: the model may call a tool, and the answer comes after the tool.
The loop is bounded at five steps. The events of a tool are `tool.called` (the
call of the model, with its arguments) and `tool.result` (the outcome of the
tool). The client of today ignores the events it does not know, so the two
arrive without breaking anything. The pages a tool found are sources of the
answer: they are cited like the ones of the search, and the answer cites them
the same way.

A call with the wrong arguments never kills a run: the schema of a tool is
loose on purpose, and the tool answers the model with what it needs.

The reservation of a run is its first step, and the answer that must follow
it: the answer reads what the tools of the step add, so its ceiling holds the
pool of the run and the share of the step that follows it. The steps after
that ask the ledger for what they need, one extension at a time, and the
extension is atomic: two runs never share it, and the money of the day and
the row of the run move together. The last step of the loop runs WITHOUT
tools, so a run always ends with an answer and never with a tool call nobody
reads — and the money never cuts a run in the middle: a step the run cannot
pay for becomes the answer. The ledger books the real cost, even when it is
more than the reservation: the money is spent whatever the ledger says.

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

A run of the assistant is a loop, so it reserves as it goes: the run holds the
money of its first step and of the answer that follows it, and every step
after that asks the ledger for one atomic extension — refused when the cap of
the day is reached. A step that cannot be paid for runs without tools: the
model answers with what it has. One step may not add more than a share
(20 000 characters) to the context of a run, whatever the number of the tools
it calls at once.

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
bulk service of its own; without it the service has no search.
`OSIONOS_AI_BRIDGE_URL` (the bridge of the write tools; a deployment in
production refuses to start without it). A missing or
broken variable stops the service and names the variable, never its value.

`OSIONOS_AI_IMAGE_CHECK_DIR` (the directory of the models of the output check
of the generated images, devil C73 — the two pinned classifiers that decide
whether an image may be stored; `scripts/fetch-image-check.sh <dir>` fills it
from the hub and checks every byte against the lock of the spike). The images
on (`OSIONOS_AI_IMAGES=on`) need it, like the engine URL and the price: a
missing variable stops the service and names the variable. The models are read
from the disk only — the service never reaches the hub for them, and a check
that cannot be loaded refuses every image rather than storing one unchecked.

The indexer reads `OSIONOS_AI_DATABASE_URL`, `OSIONOS_AI_EMBED_BULK_URL`
(`OSIONOS_AI_EMBED_URL` when the bulk one is not set) and
`OSIONOS_AI_EMBED_MODEL` (`intfloat/multilingual-e5-small`).

## L1 moderation worker

    pnpm --filter @osionos/ai-service jobs

Drains the `moderate` jobs that the database triggers queue for comments on
PUBLIC pages (or public workspaces), scores each comment with a toxicity
classifier served by TEI (`POST /predict`; the pinned model is
`textdetox/xlmr-large-toxicity-classifier-v2`, label `toxic`), and writes one
append-only row to `ai_moderation_events` per decision.

| `OSIONOS_MODERATION_ACTIONS` | The worker does |
| --- | --- |
| `off` | nothing (the process idles) |
| `log` (default) | scores and audits the would-be action; changes no comment |
| `hold` | as `log`, and moves a comment with toxic score >= `OSIONOS_MODERATION_L1_HOLD` (0.9) to `held` |
| `on` | runs as `hold`: auto-removal is refused, no language has the per-language precision evidence (C83) |

Other variables: `OSIONOS_MODERATION_L1_URL` (required unless `off`),
`OSIONOS_MODERATION_L1_MODEL`, `OSIONOS_MODERATION_L1_REVISION`, and
`OSIONOS_MODERATION_CALIBRATED_POLICY`. `hold` only holds while the
policy hash (sha256 of `{model, revision, hold}`, printed at boot) equals the
calibrated one; any other hash runs as `log` until recalibrated (C85).

It never: removes or erases a comment (the only state it writes is `held`),
scans a private page or a DM, applies a verdict to content other than the one
it scored (the sha256 must match, under a row lock), or hides a comment when
the classifier is down (the job retries with backoff).

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
