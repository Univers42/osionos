# 0008. Failover that knows the free quota is shared

Date: 2026-11-02. Status: accepted. Refs Univers42/groot#155. Follows [0007](0007-upstream-error-codes.md).

## Context

Every public user spends one OpenRouter key on `:free` routes: 20 requests a minute for the
whole account ([limits](https://openrouter.ai/docs/api-reference/limits)). Extra keys add
nothing. The SDK retried each step twice, so one question could spend 15 calls, and a chain
walked its remaining free routes into a quota that was already closed.

OpenRouter has no origin field on a 429
([errors](https://openrouter.ai/docs/api-reference/errors)). The limits page ties
`X-RateLimit-*` to "a platform limit". The upstream shape (`provider_name`, `raw`) comes from
public logs, not the docs. No live 429 was captured.

## Decision

- The SDK never retries a provider call. The chain is the retry; a run with one route gets
  one retry of its own on a 5xx or a network failure, after 1 to 3 s with jitter, if nothing
  was emitted and the account is not resting.
- A 402 or 429 on a platform free route reads as, in order: `X-RateLimit-*` → account;
  a provider marker → provider; `error_type: rate_limit_exceeded` → account; else ambiguous.
- Account: one Redis key closes every free route for everyone, up to 300 s. The write is a Lua
  script that only extends, so concurrent runs keep the longest rest.
- Ambiguous: the run stops walking free routes and rests that route. The account rests only
  when corroborated (3 failures from 2 users in 30 s), the rule routes already use.
- Provider: next route, rest that route alone.
- A run still moves to a route off the shared quota (a user's connection, a paid model).
- While the account rests, a run whose routes are all free is refused with 429 and
  `Retry-After`, before the transcript is touched.
- An approval's continuation is not refused: the approved work happened, so it tries once.

## Consequences

- At most 7 calls per run: 2 failed routes and 5 steps, or 6 with one route (1 retried step
  and 5 steps); 14 for research; +1 summary when `OSIONOS_AI_SUMMARY=on`. An approval's continuation is another run. The bound comes from
  `MAX_ATTEMPTS`, `MAX_STEPS`, `maxRetries: 0` and the one retry; there is no counter.
- A 5xx after the first step ends the run, and so does a second 5xx. `/complete` has no retry.
- This overrides "a run never fails without trying", only for a confirmed account rest.
- A day's cap rests 300 s, so a closed day is probed about 12 times an hour.
- A mid-stream rate limit (a 200 stream) moves nothing and rests nothing.
- `openrouter/free` is treated as shared on no documented ground.
- A user's own OpenRouter connection keeps per-route behaviour.

## Devil verdict

PROCEED-WITH-CONDITIONS. Blast 4, reversibility 2, cost 4, confidence 5 (worst: no live capture).
It moved the refusal before the delete of a Retry, made the ambiguous default per-run rather
than global, and added the continuation rule.
