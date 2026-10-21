# RESULTS — AI-P0c: local CPU model servers (TEI embeddings + llama.cpp chat) — measure only

Date: 2026-10-21. Worktree: `W=/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-ai-gw`, branch `feat/ai-spike-gateway`.
All node execution inside `node:22-bookworm-slim` docker. No host node exists on this machine.
No number below was tuned or re-run to improve; every table is a single full run of the protocol below, printed as measured.

## Machine facts

- host `nproc` = 20, Docker 29.1.3, kernel Linux 6.17.0-14-generic
- `node -v` (container) = v22.23.3
- TEI container: `--memory 6g --cpus 8`, published `127.0.0.1:4911:80`
- llama.cpp: **not** started by this spike — the chat server already ran as `ai-dev-llm` (see "Chat server: pre-existing")
- no GPU on this host; both runtimes are CPU-only

## Image tags and release dates

Rule applied: newest release published at least 7 days before 2026-10-21 (i.e. `published_at <= 2026-10-14T00:00:00Z`),
exact image tag pinned. Release dates read from the GitHub releases API
(`https://api.github.com/repos/huggingface/text-embeddings-inference/releases`,
`https://api.github.com/repos/ggml-org/llama.cpp/releases`).

| role | image tag | release | published | days before 2026-10-21 | local image id |
|---|---|---|---|---|---|
| embeddings | `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4` | `v1.9.4` | 2026-09-15T09:28:03Z | 35.9 | `sha256:8ce0330d3eae11511627a5b3eeef7001f76970ad3633d771147b57915c021dd7` (built 2026-09-15T09:01:24Z) |
| chat | `ghcr.io/ggml-org/llama.cpp:server-b11580` | `b11580` | 2026-10-13T04:02:51Z | 8.1 | `sha256:229d7f195920404bbf6aee459481ae3cc9604c534801956253f4d251ae5ebdcf` (built 2026-10-13T04:54:43Z) |

- TEI: `v1.9.4` is the newest TEI release at all (previous `v1.9.3`, 2026-03-23), so it satisfies the ≥ 7 days rule.
- llama.cpp: the project tags every build prerelease. `b11580` is the build the pre-existing `ai-dev-llm`
  container already runs and it was published 2026-10-13, i.e. **8.1 days** before 2026-10-21 — it satisfies the
  ≥ 7 days rule. (For reference: the newest llama.cpp release at all on 2026-10-21 was `b11784`, published
  2026-10-21T05:44:28Z; the newest release older than 7 days was `b11606`, 2026-10-13T22:35:27Z.)
- Tag existence verified with `docker pull` (TEI) and `docker manifest inspect` (llama.cpp).

## Models, files and SHA256

| role | repo | file | bytes | SHA256 |
|---|---|---|---|---|
| embeddings | `intfloat/multilingual-e5-small` (HF rev `614241f622f53c4eeff9890bdc4f31cfecc418b3`) | `onnx/model.onnx` | 470 268 510 | `ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665` |
| chat | `unsloth/Qwen3-4B-Instruct-2507-GGUF` (HF rev `a06e946bb6b655725eafa393f4a9745d460374c9`), quant `Q4_K_M` | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2 497 281 120 | `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597` |

SHA256 computed with `sha256sum` on a **read-only** mount of the volumes in a throwaway container; both match the
HuggingFace cache blob names.

## Volumes

| volume | holds | after the spike |
|---|---|---|
| `osionos_ai_models_tei` | HF cache for `intfloat/multilingual-e5-small` (`onnx/model.onnx`, `tokenizer.json` 17 082 730 B, `config.json`, …) | **kept** (reused by the next phase) |
| `osionos_ai_models_llm` | HF cache for `unsloth/Qwen3-4B-Instruct-2507-GGUF` (Q4_K_M gguf) | **kept** (reused by the next phase) |

Both live on Docker's root disk (`/mnt/storage/docker/volumes/…`), i.e. the big disk.

## Chat server: pre-existing (per the brief's UPDATE)

The UPDATE overrides the chat part: **the chat server already ran as `ai-dev-llm`** and was not started, restarted
or modified by this spike. **No `ai-spike-llm` container was created.** The only reads of that container were
`docker inspect` and a read-only volume mount.

```
docker inspect ai-dev-llm --format '{{json .Config.Cmd}}'
["-hf","unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M","--alias","qwen3-4b","--host","0.0.0.0","--port","8080","-c","8192","-t","8","--jinja"]
docker inspect ai-dev-llm --format 'Mem={{.HostConfig.Memory}} Cpu={{.HostConfig.NanoCpus}}'
Mem=6442450944 Cpu=8000000000
```

- image `ghcr.io/ggml-org/llama.cpp:server-b11580`, network `ai-dev-net` (alias `ai-dev-llm`, IP 172.16.251.4), **not published** on any host port
- `--alias qwen3-4b` ⇒ model id = `qwen3-4b`; `--jinja` is what makes llama.cpp's tool calling work
- `-c 8192` context, `-t 8` threads, 6 GiB memory limit

---

# 1. Embeddings — TEI + `intfloat/multilingual-e5-small` (384-d)

## Container start

```
timeout 1800 docker run -d --name ai-spike-tei \
  --memory 6g --cpus 8 \
  -p 127.0.0.1:4911:80 \
  -v osionos_ai_models_tei:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4 \
  --model-id intfloat/multilingual-e5-small \
  --json-output
```

Small artifacts downloaded in 5.7 s, `onnx/model.onnx` in ~97 s; server `Ready` at 2026-10-21T05:58:14Z.

## `/info` (real response)

```json
{
  "model_id": "intfloat/multilingual-e5-small",
  "model_sha": null,
  "model_dtype": "float32",
  "served_model_name": "intfloat/multilingual-e5-small",
  "model_type": { "embedding": { "pooling": "mean" } },
  "max_concurrent_requests": 512,
  "max_input_length": 512,
  "max_batch_tokens": 16384,
  "max_batch_requests": 8,
  "max_client_batch_size": 32,
  "auto_truncate": true,
  "tokenization_workers": 7,
  "version": "1.9.4",
  "sha": "e80ef225ed0e6cb1717ce632a6a84b6cf211bb67",
  "docker_label": "sha-e80ef22"
}
```

**Embedding dimension 384**, confirmed on live embeddings (`len(embeddings[0]) == 384`) as well as by the
`/v1/models` metadata of the chat model below. TEI logged
`Backend does not support a batch size > 8 → forcing max_batch_requests=8`: the CPU ONNX backend splits every
32-input request into 8-input micro-batches internally.

## (a) Query latency — sequential, n=300

One `POST /embed {"inputs": "query: <8–15 words>"}` per request, strictly one at a time. 10 identical warm-up
requests are run first and discarded. Percentiles are nearest-rank, the same convention as the P0a spike.

| metric | n | p50 | p95 | p99 | min | max | mean |
|---|---|---|---|---|---|---|---|
| sequential query | 300 | 7.62 ms | **9.24 ms** | 11.01 ms | 5.65 ms | 14.44 ms | 7.73 ms |

Sample query actually sent (13 words):
`"query: webhook subscription onboarding activation webhook cohort latency scope quarter integration onboarding stakeholder"`

## (b) Backfill throughput — 20 000 passages

Passages are generated text of ~350 tokens. The length is **calibrated against the model's own tokenizer**
(`POST /tokenize`), not assumed: 201 words → 349 tokens; over a 25-passage sample the real length is
mean **343.2** tokens (min 324, max 357). The e5 prefixes are kept (`query: ` / `passage: `).
Each request carries 32 passages (`max_client_batch_size` = 32), 4 requests in flight → 625 requests.

| metric | value |
|---|---|
| passages | 20 000 |
| tokens per passage | 343.2 mean (324–357) |
| batch size | 32 |
| concurrency | 4 |
| requests | 625 |
| total time | **1098.45 s** |
| **throughput** | **18.21 chunks/s** (passages/s) |

Throughput was flat across the whole run (the progress line printed every 25 batches stayed between 18.0 and
18.2 chunks/s from batch 25 to batch 625) — no warm-up drift and no memory-pressure cliff.

## (c) Concurrency 16 — single queries

Same single-query payload as (a), 16 requests in flight, n=300 total.

| metric | n | p50 | p95 | p99 | min | max | mean |
|---|---|---|---|---|---|---|---|
| concurrency-16 query | 300 | 71.03 ms | **79.48 ms** | 81.03 ms | 11.19 ms | 81.48 ms | 70.62 ms |

16-way concurrency costs ~8.6× the sequential p95 (9.24 → 79.48 ms) on 8 CPUs: TEI's CPU backend processes at most
8 sequences per forward pass, so 16 concurrent queries are served in two waves.

## Sanity — cosine ranking

```
embedding dim: 384
cosine(query, relevant)   = 0.841464
cosine(query, irrelevant) = 0.673054
SANITY (relevant > irrelevant): PASS
```

Query `query: how many deals close this quarter` vs `passage: Deals closing in Q4: Acme 60,000 EUR` (0.841464) and
vs `passage: The cat sat on the mat` (0.673054) — the relevant passage wins by 0.168.

---

# 2. Chat — llama.cpp server + Qwen3-4B-Instruct (tool calling)

Benchmarks ran from a throwaway `node:22` container on `ai-dev-net` against `http://ai-dev-llm:8080`.

## (a) `GET /v1/models`

```json
{
  "models": [
    { "name": "qwen3-4b", "model": "qwen3-4b", "type": "model", "capabilities": ["completion"],
      "details": { "format": "gguf" } }
  ],
  "object": "list",
  "data": [
    { "id": "qwen3-4b", "object": "model", "created": 1792562388, "owned_by": "llamacpp",
      "meta": { "vocab_type": 2, "n_vocab": 151936, "n_ctx": 8192, "n_ctx_train": 262144,
                "n_embd": 2560, "n_params": 4022468096, "size": 2491323904, "ftype": "Q4_K - Medium" } }
  ]
}
```

Model id = `qwen3-4b`; 4 022 468 096 params, `n_embd` 2560, `n_ctx` 8192, `Q4_K - Medium`.

## (b) 5 streamed chat completions (~300-token prompt, `max_tokens` 200)

Prompt calibrated against the server's own tokenizer (`POST /tokenize`): 290 words → 302 tokens; the runs used
306–313 prompt tokens. `stream: true`, `stream_options.include_usage: true`; llama.cpp returned server-side
`timings` on the final SSE chunk, so the server numbers are reported first and the measured ones alongside.

| run | TTFT | total | prompt tok | out tok | decode tok/s (server `timings`) | prompt tok/s (server `timings`) | cache_n |
|---|---|---|---|---|---|---|---|
| 1 | 122.04 ms | 13 345.22 ms | 313 | 200 | 15.05 | 13.04 | 312 |
| 2 | 98.27 ms | 12 626.25 ms | 306 | 200 | 15.88 | 16.68 | 305 |
| 3 | 3 211.41 ms | 15 705.60 ms | 311 | 200 | 15.93 | 97.68 | 0 |
| 4 | 3 148.63 ms | 15 618.28 ms | 312 | 200 | 15.96 | 99.96 | 0 |
| 5 | 3 127.02 ms | 15 597.61 ms | 310 | 200 | 15.96 | 100.01 | 0 |

**TTFT p50 = 3 127.02 ms** · **decode = 15.76 tok/s** (server avg over the 5 runs; measured avg, out_tok ÷
decode window, 15.83 tok/s) · **prompt = 65.47 tok/s** (server avg over the 5 runs).

The TTFT spread is llama.cpp's **KV prefix cache**, not noise: runs 1–2 hit the cache (`cache_n` 312 / 305
tokens reused, so only 1 token had to be prefilled → ~100 ms TTFT), runs 3–5 were evicted (`cache_n` 0) and had to
prefill ~310 prompt tokens from scratch at ~98–100 tok/s → ~3.1 s TTFT. The honest cold-prefill figure is
**~100 prompt tok/s ⇒ ~3.1 s TTFT for a 310-token prompt**; the warm-cache figure is **~100 ms TTFT**.
The `prompt tok/s` column of the cached runs (13–17) is llama.cpp timing the single uncached token only, so the
mean of 65.47 tok/s mixes two regimes — the cold-prefill rate is the ~100 tok/s figure.

## (c) Tool-call round trip

Tool `get_weather({city})` with `city` a required string; prompt exactly `What is the weather in Paris? Use the tool.`;
`tool_choice: "auto"`, `stream: true`.

```
finish_reason: tool_calls
tool_call: name=get_weather args={"city": "Paris"}
parsed arguments: {"city":"Paris"}
TOOL CALL (get_weather with Paris): PASS
```

The model streamed a `get_weather` call whose arguments contain Paris. **PASS.**

## (d) 4 concurrent streams

| stream | TTFT | total | out tok |
|---|---|---|---|
| 1 | 12 523.86 ms | 31 357.12 ms | 200 |
| 2 | 12 523.46 ms | 31 356.62 ms | 200 |
| 3 | 12 524.29 ms | 31 357.25 ms | 200 |
| 4 | 12 523.55 ms | 31 357.04 ms | 200 |

wall 31.36 s · 800 completion tokens → **aggregate 25.51 tok/s** · concurrent TTFT p50 12 523.55 ms, p95 12 524.29 ms.

Four streams share the server's 8 threads, so aggregate throughput rises only 1.6× over one stream (15.76 → 25.51 tok/s)
while each stream's TTFT quadruples (3.1 s → 12.5 s).

## AI-SDK round trip (P0a adapter → local runtime)

`@ai-sdk/openai-compatible` (3.0.68) + `ai` (7.0.139) from the P0a spike's `node_modules`, pointed at
`http://ai-dev-llm:8080/v1`, model id taken from `/v1/models`, streamed through `streamText`:

```
AI-SDK target: http://ai-dev-llm:8080/v1  model=qwen3-4b
--- AI-SDK STREAM TEXT ---
An embedding model is used to convert textual, numerical, or other data into dense vectors that capture semantic meaning, enabling machines to understand and process information similarly to how humans do.
--- END ---
elapsed: 2380 ms
usage: {"inputTokenDetails":{},"outputTokenDetails":{}}
stream part types: start, start-step, text-start, text-delta, text-end, finish-step, finish
```

No API key was sent (the SDK's `apiKey` field is a placeholder; llama.cpp's server does not authenticate), and the
full v7 stream part sequence came through — the planned adapter talks to a local runtime.

---

# Exact commands

```
# --- version / image selection -------------------------------------------------
timeout 120 curl -sS -m 60 https://api.github.com/repos/huggingface/text-embeddings-inference/releases -o tei-rel.json
timeout 120 curl -sS -m 60 "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=100" -o llama-rel.json
timeout 300 docker pull ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4
timeout 120 docker manifest inspect ghcr.io/ggml-org/llama.cpp:server-b11580

# --- TEI (the only container this spike started) --------------------------------
timeout 1800 docker run -d --name ai-spike-tei \
  --memory 6g --cpus 8 \
  -p 127.0.0.1:4911:80 \
  -v osionos_ai_models_tei:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4 \
  --model-id intfloat/multilingual-e5-small \
  --json-output
# readiness (bounded): poll GET /health until 200
timeout 60 curl -sS -m 20 http://127.0.0.1:4911/info
timeout 60 curl -sS -m 20 -X POST http://127.0.0.1:4911/embed -H 'content-type: application/json' -d '{"inputs":"query: hello world"}'
timeout 60 curl -sS -m 20 -X POST http://127.0.0.1:4911/tokenize -H 'content-type: application/json' -d '{"inputs":"query: hello world"}'

# --- TEI benchmark (node:22, --network host, no npm deps) -----------------------
timeout 3600 docker run --rm --network host -v "$W/services/osionos-ai/spikes/local-models:/s" -w /s \
  node:22-bookworm-slim node tei-bench.mjs

# --- llama.cpp benchmark (node:22 on ai-dev-net, no npm deps) ------------------
timeout 1800 docker run --rm --network ai-dev-net -v "$W/services/osionos-ai/spikes/local-models:/s" -w /s \
  node:22-bookworm-slim node llm-bench.mjs

# --- AI SDK round trip (P0a node_modules mounted read-only) ---------------------
timeout 900 docker run --rm --network ai-dev-net \
  -v "$W/services/osionos-ai/spikes/gateway-overhead/node_modules:/app/node_modules:ro" \
  -v "$W/services/osionos-ai/spikes/local-models:/app/spikes:ro" \
  -w /app/spikes node:22-bookworm-slim node aisdk-local.mjs

# --- model file + SHA256 (read-only volume mounts, throwaway containers) --------
timeout 600 docker run --rm --network none -v osionos_ai_models_llm:/models:ro alpine:3.20 \
  sha256sum /models/models--unsloth--Qwen3-4B-Instruct-2507-GGUF/snapshots/*/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
timeout 600 docker run --rm --network none -v osionos_ai_models_tei:/data:ro alpine:3.20 \
  sha256sum /data/models--intfloat--multilingual-e5-small/snapshots/*/onnx/model.onnx

# --- teardown: container removed, volumes KEPT ---------------------------------
timeout 120 docker rm -f ai-spike-tei
```

## Verdict

```
GATE TEI query p95 < 30 ms: PASS (9.24)
TEI backfill: 18.21 chunks/s
GATE llama tool call round trip: PASS
llama decode: 15.76 tok/s, TTFT p50 3127.02 ms
```

## Caveat

Caveat: the CPU was shared with the rest of the host's running containers during the whole measurement (20 vCPU
total, TEI capped at 8 threads and llama.cpp at 8, other dev stacks running alongside), the corpus is synthetic
text generated from a fixed word pool (so passages are repetitive word salad rather than natural prose, and the e5
vectors are computed over that instead of real workspace content), and the chat model is a 4B Q4_K_M quantisation
whose answers are demo-grade — good enough to prove the adapter talks to a local runtime, not good enough to
judge answer quality; TEI's CPU backend caps a forward pass at 8 sequences so a 32-passage request is not one
GEMM, llama.cpp's KV prefix cache shifts TTFT by two orders of magnitude between a cache hit (~100 ms) and a cold
prefill (~3.1 s), the 20 000-passage backfill ran once so its 18.21 chunks/s carries no run-to-run variance
figure, and neither runtime was measured with a warm client-side connection pool or over a real network.
