# 0007. Stable codes for provider failures

- Status: Accepted with conditions
- Date: 2026-11-01
- Deciders: devil verdict (PROCEED-WITH-CONDITIONS), awaiting review
- Related: Univers42/groot#155, wiki/project/ai-stall-diagnosis-2026-10-29.md (groot)

## Context

Every provider failure reached the browser as `upstream_error`, and
`ai_runs.error` held the same word, so a 429, a daily cap and an oversized
prompt could not be told apart after the fact. The frame also carried `message`,
the name of the error, which no client read.

Facts the decision rests on, read from the code:

- `ai_runs.error` is a key as well as a record: `runner.ts` and `routes/images.ts`
  look it up in `PREFLIGHT_ERRORS`, and a re-POST of a run whose row says exactly
  `rate_limited` is refused 429 instead of re-attached.
- The whole run sits in one `try`, so `pg`'s `ECONNREFUSED` matches the network
  list of `failover.ts`.
- `metadata.error_type` is stripped from the SDK's `data` by its schema: it is
  only in the raw `responseBody`.
- An error inside a 200 stream reaches `fullStream` as `StreamProviderError`.

## Decision

`src/runs/upstreamError.ts` maps a failure to `rate_limited`, `quota_exhausted`,
`provider_unavailable`, `context_too_long` or `upstream_error`.

| Rule | Why |
| --- | --- |
| The `error` frame is `{ code, retryAfterSeconds? }` on `/runs` and `/complete` | A closed code cannot carry the words of a provider |
| `ai_runs.error` is `code[:status[:type]]` | An upstream `rate_limited` always has a status, so it never equals the preflight key |
| Only the error of the attempt is classified (identity check) | Our own database failure must not read as the provider being down |
| `usage.attempts[].outcome` keeps the bare code | Nothing there needs the status |
| Provider text is bounded at 4 KiB and read by linear patterns | A connection's upstream is hostile input |
| `retryAfterSeconds` is sent for `rate_limited` only, positive, capped at 300 | A hostile value must not hide the Retry button for long |
| `failover.ts` decisions do not change | The route reason, the allowlist and the billing are another decision |

## Consequences

- Queries on `error = 'upstream_error'` miss the new rows: use
  `split_part(error, ':', 1)`.
- An `error_type` shaped like a plain word (`[A-Za-z0-9_.-]{1,64}`) is stored as
  the provider wrote it. It stays in the row and never reaches a client.
- The new codes keep the sentence and the retry of `upstream_error`: no new copy.
- `rate_limited` now shows its existing sentence for an upstream 429. Without a
  `Retry-After` it prints the "60 s" of `runErrors.ts`, which nobody measured, and
  the Retry button is offered at once. Accepted: it is today's rate-limit fallback.
- A tab loaded before the deploy reads a new code through `errorWords`:
  `The assistant failed (<code>). Try again.` with no Retry button, until refresh.
- `message` is gone from these frames, while `routes/images.ts` keeps it on its
  own frames: the image path is out of scope, and the difference is deliberate.

## Not verified

The daily-cap text, the context-window text and `metadata.error_type` were not
captured from a live OpenRouter or llama.cpp. A miss falls back to `rate_limited`
or `upstream_error`. The test fixtures are labelled as unverified.
