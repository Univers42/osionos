# osionos-ai

The AI assistant of osionos: a stateless Node service, separate from the
single-process bridge. This skeleton makes no model call — it carries the
bridge's `osionos_v1` app-session tokens (scripts/bridge-session-token.mjs), the
workspace-access rule, conversations, and a health route. Runs come with P1c-2.

## Routes

| Route | Auth | Answer |
| --- | --- | --- |
| `GET /api/ai/health` | no | `{ ok, db, redis }`, each check under a second |
| `POST /api/ai/conversations` | yes | 201 with the row, 404 when the workspace is not accessible |
| `GET /api/ai/conversations?workspaceId=<uuid>` | yes | the caller's own conversations, newest first |
| `GET /api/ai/conversations/:id/messages` | yes | 404 unless the caller owns the conversation |

## Environment

Required: `OSIONOS_AI_DATABASE_URL`, `OSIONOS_AI_REDIS_URL`, `OSIONOS_APP_SESSION_SECRET`.
Optional: `OSIONOS_AI_PORT` (4300), `OSIONOS_ALLOWED_ORIGIN` (the app URL),
`OSIONOS_APP_SESSION_TTL_SECONDS` (3600), `OSIONOS_BAAS_URL` and `SERVICE_ROLE_KEY`
(the bridge's names — the session-cutoff poller reads them), `OSIONOS_SESSION_CUTOFFS`
(`off` turns the cut-off check off). A missing required variable stops the service
and names the variable, never its value.

## Tests

    sh services/osionos-ai/scripts/test.sh /path/to/osionos-ai-migration.sql

Throwaway `pgvector/pgvector:0.8.0-pg16` and `redis:7.4-alpine` containers on a private network; both are removed when the script exits.
