# RESULTS — AI-P0a: gateway passthrough overhead (throwaway spike, measure only)

Date: 2026-10-21. Worktree: `W=/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-ai-gw`, branch `feat/ai-spike-gateway`.
All node execution inside `node:22-bookworm-slim` docker with `--network host`. No host node exists on this machine.
No numbers below were tuned or re-run to improve; run #1 and run #2 are consecutive full runs (run #2 additionally captures the proxy RSS line, see "Run commands").

## Machine facts

- `nproc` (host) = 20
- `node -v` (container) = v22.23.3, `npm -v` = 10.9.9
- kernel = Linux 6.17.0-14-generic; Docker 29.1.3
- Bench topology: browser-substitute (bench.mjs) → proxy.mjs (AI SDK `streamText` + `@ai-sdk/openai-compatible`) → mock-upstream.mjs, all inside one container sharing the host loopback. Mock: 100 ms pre-roll, then 64 SSE chunks 5 ms apart, deterministic words `w0 w1 … w63`, last chunk `finish_reason: "stop"` + usage, then `data: [DONE]` (verified by probe: concatenated content `"w0 w1 … w63 "`, 65 event blocks).

## Chosen package versions (rule: newest version published ≥ 7 days before 2026-10-21, i.e. publish ≤ 2026-10-14T00:00:00Z)

Determined with `npm view <pkg> time --json` run inside the container against the real registry:

| package | chosen | published | days before 2026-10-21 |
|---|---|---|---|
| `ai` | **7.0.139** | 2026-10-13T16:10:54.664Z | 7.3 |
| `@ai-sdk/openai-compatible` | **3.0.68** | 2026-10-12T17:48:58.266Z | 8.3 |
| `zod` | **4.6.7** | 2026-10-12T16:29:37.778Z | 8.3 |

Excluded per the rule: `ai@7.0.147` (2026-10-20), `@ai-sdk/openai-compatible@3.0.74` (2026-10-20). Peer ranges of both chosen SDK packages: `zod ^3.25.76 || ^4.1.8` — zod 4.6.7 satisfies. `npm install --save-exact` resolved with 0 conflicts, 0 vulnerabilities (12 packages). `package-lock.json` committed; `node_modules/` gitignored.

## Run commands (exact)

Version check (data above; manifest fetches redirect through the host shell into /tmp/opencode/ai-spike/, then the selection script picks the newest stable version with `published <= 2026-10-14T00:00:00Z`):

```
timeout 120 docker run --rm --network host -v "$O:/o" -w /o node:22-bookworm-slim npm view ai time --json              > "$O/ai-time.json"
timeout 120 docker run --rm --network host -v "$O:/o" -w /o node:22-bookworm-slim npm view @ai-sdk/openai-compatible time --json > "$O/oai-time.json"
timeout 120 docker run --rm --network host -v "$O:/o" -w /o node:22-bookworm-slim npm view zod time --json             > "$O/zod-time.json"
timeout 180 docker run --rm --network host -v "$O:/o" -w /o node:22-bookworm-slim node /o/version-check.mjs
# -> CHOSEN: ai 7.0.139 / @ai-sdk/openai-compatible 3.0.68 / zod 4.6.7 (selection script printed above in the transcript)
```

Install:

```
timeout 300 docker run --rm --network host -v "$W/services/osionos-ai/spikes/gateway-overhead:/s" -w /s node:22-bookworm-slim \
  npm install --save-exact --loglevel=error
# -> "added 12 packages, and audited 13 packages in 2s ... found 0 vulnerabilities"; npm ls: @ai-sdk/openai-compatible@3.0.68, ai@7.0.139, zod@4.6.7
```

Benchmark (brief's one-liner, with two documented adjustments, see "Deviations"):
the brief's `sh -c '…kill %2'` cannot work on bookworm (`/bin/sh` = dash, non-interactive job control off: `kill: No such process`), and the container must outlive the SIGTERM long enough for the proxy to print its RSS. Run as:

```
timeout 900 docker run --rm --network host -v "$W/services/osionos-ai/spikes/gateway-overhead:/s" -w /s node:22-bookworm-slim \
  bash -c 'node mock-upstream.mjs & node proxy.mjs & sleep 1; node bench.mjs; kill %2; wait %2 2>/dev/null; sleep 1'
```

Smoke (Zen):

```
timeout 300 docker run --rm --network host -v "$W/services/osionos-ai/spikes/gateway-overhead:/s" -w /s node:22-bookworm-slim \
  node smoke-zen.mjs
```

## Benchmark output (run #2, real console output, unchanged)

```
mock-upstream listening on http://127.0.0.1:4901
proxy listening on http://127.0.0.1:4902
warm-up: 20 direct + 20 proxied (discarded)
collected sequential direct: n=200
collected sequential proxied: n=200

== SEQUENTIAL (n=200 each) ==
metric   direct_p50  direct_p95  direct_p99  proxied_p50 proxied_p95 proxied_p99 overhead_p50 overhead_p95 overhead_p99
TTFT   101.16 ms   101.53 ms   102.28 ms   103.35 ms   104.25 ms   105.14 ms   2.18 ms      2.71 ms      2.86 ms
TOTAL  421.26 ms   430.09 ms   439.97 ms   423.91 ms   428.07 ms   436.97 ms   2.65 ms      -2.02 ms     -2.99 ms
collected concurrent direct: n=200
collected concurrent proxied: n=200

== CONCURRENT (n=200 each) ==
metric   direct_p50  direct_p95  direct_p99  proxied_p50 proxied_p95 proxied_p99 overhead_p50 overhead_p95 overhead_p99
TTFT   103.76 ms   143.02 ms   143.17 ms   148.77 ms   178.25 ms   196.74 ms   45.01 ms     35.23 ms     53.57 ms
TOTAL  443.07 ms   486.13 ms   487.20 ms   495.07 ms   541.17 ms   545.98 ms   51.99 ms     55.04 ms     58.77 ms

GATE overhead p95 TTFT: sequential 2.71 ms | concurrent 35.23 ms (threshold 15 ms)
PROXY PEAK RSS: 159.04 MB (sampled every 100 ms)
```

### Overhead tables (from run #2; run #1 output is preserved below for reproducibility — no run was cherry-picked)

Sequential — overhead = PROXIED − DIRECT (nearest-rank percentiles, n=200 per mode):

| metric | p50 | p95 | p99 |
|---|---|---|---|
| TTFT | +1.95 ms → **2.18 ms** | **+2.81 ms → 2.71 ms** | +4.20 ms → 2.86 ms |
| TOTAL | +2.07 ms → 2.65 ms | −0.71 ms → −2.02 ms | +0.13 ms → −2.99 ms |

Concurrent (4 rounds × 50 in-flight) — overhead = PROXIED − DIRECT:

| metric | p50 | p95 | p99 |
|---|---|---|---|
| TTFT | +26.36 ms → 45.01 ms | **+26.55 ms → 35.23 ms** | +30.75 ms → 53.57 ms |
| TOTAL | +37.18 ms → 51.99 ms | +39.75 ms → 55.04 ms | +44.71 ms → 58.77 ms |

Arrows: run #1 → run #2. Sequential overhead p95 TTFT ≈ 2.7–2.8 ms in both runs; concurrent ≈ 26.5–35.2 ms — verdict identical in both runs.

### Run #1 (first full run, identical protocol, RSS line missing because the container was torn down before the SIGTERM handler could print — the cause of run #2)

```
== SEQUENTIAL (n=200 each) ==
metric   direct_p50  direct_p95  direct_p99  proxied_p50 proxied_p95 proxied_p99 overhead_p50 overhead_p95 overhead_p99
TTFT   101.22 ms   101.53 ms   101.72 ms   103.16 ms   104.34 ms   105.92 ms   1.95 ms      2.81 ms      4.20 ms
TOTAL  421.68 ms   428.30 ms   431.88 ms   423.74 ms   427.59 ms   432.01 ms   2.07 ms      -0.71 ms     0.13 ms

== CONCURRENT (n=200 each) ==
metric   direct_p50  direct_p95  direct_p99  proxied_p50 proxied_p95 proxied_p99 overhead_p50 overhead_p95 overhead_p99
TTFT   103.89 ms   131.76 ms   131.78 ms   130.25 ms   158.31 ms   162.53 ms   26.36 ms     26.55 ms     30.75 ms
TOTAL  431.48 ms   464.62 ms   464.95 ms   468.65 ms   504.37 ms   509.66 ms   37.18 ms     39.75 ms     44.71 ms

GATE overhead p95 TTFT: sequential 2.81 ms | concurrent 26.55 ms (threshold 15 ms)
```

## Proxy memory

`PROXY PEAK RSS: 159.04 MB (sampled every 100 ms)` — peak over the whole benchmark (mock served in a separate process; the ESPRIT baseline for a bare `node:http` server is ~50–60 MB).

## Smoke — opencode Zen through the same adapter

Models tried in order: `deepseek-v4.1-flash-free`, then `glm-5.3-flash-free` (fallback). Prompt was the mandated synthetic string only ("What is the weather in Paris? Use the tool."), never repo content; tool `get_weather({ city: z.string() })` with `execute → { tempC: 18 }`, `stopWhen: stepCountIs(2)`; no API key.

Both models were refused identically — the adapter reached the real endpoint (`https://opencode.ai/zen/v1/chat/completions`, OpenAI-compatible request body with `stream: true` and the tool schema was accepted for parsing) and Zen answered:

- **status: 403**
- **body: `{"type":"error","error":{"type":"FreeTierError","message":"OpenCode's free tier can only be used from within OpenCode. Download it at https://opencode.ai and keep building."}}`** (both `deepseek-v4.1-flash-free` and `glm-5.3-flash-free`; response headers include `x-opencode-log-id`, server `cloudflare`)
- distinct fullStream part types seen: none (error thrown before any stream part; no `text.delta`/`tool-call` parts)
- tool call with parsed input `{city:"Paris"}`: did not arrive (access refused)
- final text: none

Per the brief this is a **finding, not a failure**: anonymous (key-less, out-of-OpenCode) calls to Zen's free tier are refused, so end-to-end real-provider latency and tool-loop behaviour could not be exercised from this spike. The adapter path itself is proven against the mock (run #2 tables above).

## Verdict

```
GATE overhead p95 TTFT < 15 ms (sequential AND concurrent): FAIL (sequential 2.71 ms, concurrent 35.23 ms)
```

Sequential is fine (~2–3 ms ≈ one extra SSE hop + parse). The AI SDK proxy fails the gate under 50-way concurrency: ~27 ms (run #1) / ~35 ms (run #2, heavier host load this run) of added p95 TTFT, i.e. the proxy chain (per-request SDK stream construction, per-chunk re-emission) costs almost a quarter of the mock's absolute p95 TTFT (~140 ms) at that concurrency, and total-stream overhead lands around +40–55 ms. If the 15 ms gate matters under load, this rejects the naive per-request `streamText` passthrough at AI SDK 7.0.139; a lighter forward pass would need its own spike.

## Caveat

Caveat: this benchmark does not capture TLS termination (all hops are plaintext loopback), real network jitter/loss to actual model providers, provider-side rate limiting or cold-path auth, HTTP client keep-alive expiry over multi-second idle gaps, dishonest-true keep-alive reuse of the SDK's own undici agent across many concurrent requests, and only 20 samples per warm-up phase; percentiles use nearest-rank over n=200 (p99 particularly noisy), concurrent runs compete with the rest of a busy host (20 vCPUs), RSS is sampled at 100 ms and can miss narrower spikes, and the mock's fixed 5 ms cadence eliminates the upstream inter-chunk variance a real provider has — with real providers that variance may mask (or amplify) the observed overhead.

## Deviations from the brief (documented)

- `sh -c` → `bash -c`, and `kill %2` → `kill %2; wait %2 2>/dev/null; sleep 1`: dash on bookworm cannot reference background jobs from a non-interactive script, and without the wait the container was destroyed before the proxy's SIGTERM handler could print peak RSS (run #1 has the RSS line absent for exactly that reason). Everything else is the brief's one-liner verbatim.
- `stepCountIs`/`tool` are AI SDK v7 exports (`isStepCount as stepCountIs`, `tool$1 as tool` in the shipped d.ts); the v7 fullStream part for text is `text-delta` with field `text` (proxy reads `part.text ?? part.delta ?? part.textDelta` for forward/backward tolerance).
