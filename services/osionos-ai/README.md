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
(20). A missing or broken variable stops the service and names the variable, never
its value.

## Tests

    sh services/osionos-ai/scripts/test.sh /path/to/osionos-ai-migration.sql

Throwaway `pgvector/pgvector:0.8.0-pg16` and `redis:7.4-alpine` containers on a private network; both are removed when the script exits. The suite runs a mock upstream (`tests/mockUpstream.ts`) and points the service at it.
