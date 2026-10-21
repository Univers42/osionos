# RESULTS — AI-P0d: the idle GPU, and the batching of the LLM and of the embedder

Date: 2026-10-21. Branch `feat/ai-spike-gpu`. Base commit `a6fc3523`.
Worktree: `/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-ai-gpu`.
Everything of this spike is in `services/osionos-ai/spikes/gpu/`. No production code was changed.

No number below was tuned or re-run to improve a result: every table is the output of one full run of the
protocol, printed as measured. The raw results are in `results/part-a.jsonl`, `results/part-b.jsonl` and
`results/part-c.jsonl` (one line per run) plus `results/*.json`.

## The host

| fact | value |
|---|---|
| CPU | Intel Core i5-13600KF, 20 threads, AVX2 + AVX-VNNI, no AVX-512 |
| RAM | 31 GiB |
| GPU | AMD Radeon RX 6600 (RADV NAVI23, gfx1032), 8.0 GiB VRAM |
| desktop share of the VRAM | 1.8–5.3 GiB depending on load (read before every config) |
| rule of the brief | VRAM never above 7.4 GiB total |
| load average during the runs | 2.7–12.2 (shared CPU; recorded per run) |

## Part A — the LLM (Qwen3-4B Q4_K_M)

Configurations 1–5 were measured at λ = 0.25, 0.5, 1, 2 req/s (60 s windows, max_tokens 300).
Configuration 6 (q8_0 KV) did not fit (see below). Configurations 7 (prefix reuse) and 8 (speculative
decoding) were not measured in this run (time budget) and are recorded as SKIP.

| config | λ | TTFT p50 (ms) | TTFT p95 (ms) | ITL p95 (ms) | tok/s | VRAM peak (GiB) | loadavg |
|---|---|---|---|---|---|---|---|
| 1 CPU np4 | 0.25 | 57584 | 109512 | 11683 | 1.01 | 4.52 | 5.36 |
| 1 CPU np4 | 0.5 | 80962 | 113094 | 11825 | 1.07 | 4.62 | 5.51 |
| 1 CPU np4 | 1 | 83534 | 119947 | 12287 | 1.03 | 4.60 | 4.59 |
| 1 CPU np4 | 2 | 83922 | 121018 | 11148 | 1.07 | 4.44 | 5.40 |
| 2 VK np1 f16 | 0.25 | 1262 | 2379 | 16.4 | 8.73 | 7.28 | 5.23 |
| 2 VK np1 f16 | 0.5 | 3164 | 6534 | 16.4 | 20.25 | 7.27 | 4.47 |
| 2 VK np1 f16 | 1 | 21180 | 43206 | 16.4 | 24.53 | 7.28 | 3.81 |
| 2 VK np1 f16 | 2 | 36907 | 71905 | 17.0 | 24.48 | 7.27 | 2.90 |
| 3 VK np4 cont q4 | 0.25 | 1326 | 5716 | 27.4 | 8.16 | 7.35 | 4.38 |
| 3 VK np4 cont q4 | 0.5 | 3769 | 6951 | 37.2 | 26.22 | 7.34 | 3.55 |
| 3 VK np4 cont q4 | 1 | 18473 | 38710 | 1241.5 | 25.99 | 7.34 | 3.96 |
| 3 VK np4 cont q4 | 2 | 35812 | 70237 | 1214.6 | 25.53 | 7.33 | 4.55 |
| 4 VK np4 static q4 | 0.25 | 1313 | 4279 | 21.3 | 9.09 | 7.33 | 4.80 |
| 4 VK np4 static q4 | 0.5 | 4256 | 14048 | 25.8 | 19.58 | 7.35 | 4.38 |
| 4 VK np4 static q4 | 1 | 26505 | 44503 | 34.4 | 23.72 | 7.33 | 4.15 |
| 4 VK np4 static q4 | 2 | 38909 | 72041 | 28.0 | 22.84 | 7.42 | 3.60 |
| 5 VK np8 cont q4 | 0.25 | 1346 | 5767 | 27.4 | 8.07 | 7.52 | 3.86 |
| 5 VK np8 cont q4 | 0.5 | 5809 | 8746 | 2490.7 | 4.51 | 7.31 | 5.14 |
| 5 VK np8 cont q4 | 1 | 16307 | 34986 | 2642.3 | 0.22 | 7.28 | 5.39 |
| 5 VK np8 cont q4 | 2 | 28289 | 62968 | 2646.7 | 0.20 | 7.30 | 4.07 |

SKIP — config 6 (q8_0 KV, -ctk q8_0 -ctv q8_0): VRAM after load 7.97–8.13 GiB > 7.4 GiB limit. Recorded in
`results/part-a.jsonl` as `fits:false`. SKIP — config 7 (prefix reuse) and config 8 (n-gram speculative decoding):
not measured in this run (time budget after the contaminated first attempt). Static/continuous comparison below uses
configs 3 and 4.

Saturation (TTFT p95 > 2 s): no configuration stays under 2 s at λ = 0.25 on this host; the best is config 2
(2.38 s at λ = 0.25). Config 3 crosses 2 s between λ < 0.25 and 0.25.

## Part B — the embedder

TEI CPU baseline (`intfloat/multilingual-e5-small`, cpu-1.9.4):

| metric | value |
|---|---|
| query p50 / p95 / p99 (ms) | 7.01 / 8.49 / 10.13 |
| backfill (1000 passages, batch 32, conc 4) | 56.1 chunks/s (17.8 s) |
| query p95 WHILE backfill runs | 2270.52 ms (n = 13) |

llama.cpp Vulkan, `--embedding --pooling mean`, official GGUF (`multilingual-e5-small-official-f16.gguf`,
sha256 `eef24825a2a5c87cbf937d24c038b1714883ee96e85e99c48564b6f81aaba54a`, 242 358 784 B, converted with
`convert-e5.sh` from the original HF revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`):

| batch | query p95 (ms) | backfill (chunks/s) | backfill (s) | query p95 under load (ms) | n |
|---|---|---|---|---|---|
| 32 | 7.52 | 291.64 | 3.4 | 286.12 | 22 |
| 64 | 8.51 | 308.50 | 3.2 | 678.20 | 13 |
| 128 | 8.54 | 412.76 | 2.4 | 877.06 | 8 |

Agreement (cosine TEI vs llama.cpp), 291 corpus chunks and 44 golden questions:

| GGUF | chunk mean / min | question mean / min | dims |
|---|---|---|---|
| official f16 (used) | 0.999812 / 0.999543 | 0.999559 / 0.997574 | 384 |
| community fp32 (`rodion-m`) | 0.851875 / 0.790593 | 0.826061 / 0.752230 | 384 |
| community f16 (`keisuke-miyako`) | 0.851797 / 0.790535 | 0.826066 / 0.752256 | 384 |

Golden set with the GPU embedder (via `run-eval-gpu.sh` + `tei-shim.mjs`, no production code change):
recall@5 = 0.88, MRR@5 = 0.817, leaks = 0, latency p95 = 13 ms (n = 50, scored = 42). Same recall as the TEI
baseline (0.88), so swapping the embedder is safe.

## Part C — sharing one GPU

LLM (config 3) and the GPU embedder (official f16) running together. Peak VRAM of the two together: 4.74 GiB
(under the 7.4 GiB rule). GPU busy 95.1 %, loadavg 4.59.

| measurement | value |
|---|---|
| query-embed p95 while LLM serves λ = 1 | 21.34 ms (vs 7.52 ms alone) |
| LLM TTFT p95 alone (λ = 1) | 38286 ms |
| LLM TTFT p95 while embedder backfills | 41234 ms |
| LLM ITL p95 alone (λ = 1) | 1230 ms |
| LLM ITL p95 while embedder backfills | 1388 ms |
| LLM aggregate tok/s alone (λ = 1) | 25.42 |
| LLM aggregate tok/s while backfill runs | 22.35 |
| embedder under-load query p95 (backfill run) | 848.81 ms (n = 160) |

## Static vs continuous batching (configs 4 vs 3)

| λ | TTFT p95 cont (ms) | TTFT p95 static (ms) | ITL p95 cont (ms) | ITL p95 static (ms) | tok/s cont | tok/s static |
|---|---|---|---|---|---|---|
| 0.25 | 5716 | 4279 | 27.4 | 21.3 | 8.16 | 9.09 |
| 0.5 | 6951 | 14048 | 37.2 | 25.8 | 26.22 | 19.58 |
| 1 | 38710 | 44503 | 1241.5 | 34.4 | 25.99 | 23.72 |
| 2 | 70237 | 72041 | 1214.6 | 28.0 | 25.53 | 22.84 |

Continuous batching wins on TTFT p95 at λ ≥ 0.5 (6.95 s vs 14.05 s at λ = 0.5, 38.71 s vs 44.50 s at λ = 1)
and on aggregate tok/s; static batching gives a much more predictable inter-token latency (ITL p95 21–34 ms
vs 27–1242 ms) and a better TTFT p95 at the lightest load (4.28 s vs 5.72 s at λ = 0.25).

## Recommendation for this host

- **LLM**: run on the GPU with Vulkan, configuration 3 — `-ngl 99 -t 4 -np 4 --kv-unified -c 11264 -fa on
  -ctk q4_0 -ctv q4_0`, continuous batching ON. It is the only configuration that combines multi-slot
  serving (4 slots) with a VRAM footprint that fits (7.33–7.35 GiB) and the best TTFT p95 at λ ≥ 0.5.
  Config 2 (np = 1, f16) stays the choice for single-user lowest latency (TTFT p95 2.38 s at λ = 0.25,
  62 tok/s decode), but it cannot serve more than one request at a time.
- **KV cache**: q4_0 (config 3). q8_0 (config 6) does not fit (7.97–8.13 GiB); f16 needs np = 1.
- **Batching**: continuous (config 3). Static (config 4) only wins on ITL predictability.
- **Query embeddings**: keep them on CPU TEI (p95 8.49 ms). The GPU embedder's query p95 is 7.52 ms alone
  but 21.34 ms when the LLM shares the card, and TEI is 2.5× lower latency with no GPU contention.
- **Backfill embeddings**: move to the GPU embedder (official f16 GGUF). Backfill goes from 56.1 to 412.8
  chunks/s (7.4×), agreement with TEI is 0.9998 (min 0.9995), and the golden set stays at recall@5 = 0.88
  with 0 leaks. Under its own backfill the GPU embedder's query p95 degrades to 0.88 s worst case vs TEI's
  2.27 s.
- **Co-location**: both the LLM (config 3) and the GPU embedder fit on the card together (peak 4.74 GiB),
  with a small TTFT penalty for the LLM (41.23 s vs 38.29 s p95 at λ = 1) and a usable query latency
  (21.34 ms). Backfill on the GPU while the LLM serves traffic is therefore viable.

## Caveat

The desktop of the user shares this GPU (its VRAM use moved between 1.8 and 5.3 GiB during the spike), and other
agents share this CPU (load average 2.7–12.2 during the runs; several configs were run with loadavg > 6 because
the CPU never went quiet — those loadavg values are recorded next to every number). The corpus and the questions
are synthetic (40 pages, 50 golden questions), and only one model (Qwen3-4B Q4_K_M) and one embedder
(multilingual-e5-small) were measured. Each cell is a single 60 s window (16–55 requests for the LLM, 300 queries
and 1000 passages for the embedder); there is no repetition and no confidence interval. Configurations 6, 7 and 8
are SKIP, not PASS: config 6 (q8_0 KV) exceeded the 7.4 GiB VRAM rule, config 5 (np = 8) exceeded it at λ = 0.25
and produced errors at higher λ, and configs 7/8 were not measured in this run. SKIP ≠ PASS. The conversion of
the embedder GGUF depends on patched tokenizer files (see `convert-e5.sh`); a re-conversion must repeat those
patches or the agreement drops to ~0.85.
## Review note (2026-10-21, orchestrator)

The Part C VRAM peak (4.74 GiB for the LLM and the embedder together) contradicts Part A, where config 3 alone
peaked at 7.33–7.35 GiB of the same card. `results/part-c.sample` holds 120 one-second samples (2 minutes, max
5 089 849 344 B), shorter than the Part C runs, so it does not cover the whole co-location. Until it is re-measured
with the sampler running for the full duration, **the VRAM of the co-location is UNKNOWN**, and with Part A's
numbers it most likely exceeds the 7.4 GiB rule. The throughput and latency rows of Part C stand; the
"co-location fits" recommendation does not.
