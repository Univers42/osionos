# RESULTS — AI-P0d: the idle GPU, and the batching of the LLM and of the embedder

Date: 2026-10-21. Branch `feat/ai-spike-gpu`, cut from `feat/ai`.
Commit of the measurements: `fdba9cf00c9442067e1277a107d5f3114d7b3d97` (the merge of `feat/ai-admin-fallback`).
Worktree: `/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-ai-gpu`.
Everything of this spike is in `services/osionos-ai/spikes/gpu/`. No production code was changed.

No number below was tuned or re-run to improve a result: every table is the output of one full run of the
protocol, printed as measured. The protocol is fixed in the scripts of the directory, and the raw results are in
`results/*.jsonl` (one line per run) and `results/*.json` (the whole run).

## The host

| fact | value | where it was read |
|---|---|---|
| CPU | Intel Core i5-13600KF, 20 threads, AVX2 + AVX-VNNI, no AVX-512 | `lscpu`, `/proc/cpuinfo` |
| RAM | 31 GiB | `free -g` |
| GPU | AMD Radeon RX 6600 (RADV NAVI23, gfx1032), 8 573 157 376 B of VRAM (8.0 GiB) | `/sys/class/drm/card1/device/mem_info_vram_total` |
| the desktop of the user | 4.80–5.28 GB (4.48–4.92 GiB) of the VRAM, at every moment of the spike | `/sys/class/drm/card1/device/mem_info_vram_used` |
| the GPU of the desktop | `/dev/dri/renderD128`, group `render` (gid 993) | `ls -la /dev/dri`, `getent group 993` |
| no NVIDIA | no `/dev/nvidia*`, no ROCm | — |
| the load average | 2.5–15.9 during the runs (the desktop and the other agents) | `/proc/loadavg`, next to every number |
| Docker | the containers of the spike are `ai-gpu-*`, and only those | `docker ps` |

The rule of the brief is the VRAM: **the use of the card never goes above 7.4 GiB** (7 946 554 000 B). The desktop
alone holds 4.5–4.9 GiB, so the container may hold **2.5–2.9 GiB**. That number decides almost everything below:
the model of the chat is 2.33 GiB by itself.

## The images and the models

| role | image | size | id |
|---|---|---|---|
| chat, GPU | `ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580` | 857 MB | `6767a4bc44ca` |
| chat, CPU | `ghcr.io/ggml-org/llama.cpp:server-b11580` | 849 MB | `229d7f195920` |
| conversion | `ghcr.io/ggml-org/llama.cpp:full-b11580` | 2.9 GB | `e1e2e058319b` |
| embeddings, CPU | `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4` | 685 MB | `8ce0330d3eae` |
| the scripts | `node:22-bookworm-slim` | 227 MB | `d0a16be756b6` |

| model | file | bytes | sha256 |
|---|---|---|---|
| chat | `unsloth/Qwen3-4B-Instruct-2507-GGUF` (rev `a06e946bb6b655725eafa393f4a9745d460374c9`), `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2 497 281 120 | `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597` |
| embeddings (the deployment) | `intfloat/multilingual-e5-small` (rev `614241f622f53c4eeff9890bdc4f31cfecc418b3`), `onnx/model.onnx` | 470 268 510 | `ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665` |
| embeddings, the tokenizer of the deployment | the same revision, `tokenizer.json` | 17 082 730 | `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39` |
| embeddings, the GGUF of this spike | `multilingual-e5-small-official-f16.gguf` (made here, see Part B) | 242 358 784 | `eef24825a2a5c87cbf937d24c038b1714883ee96e85e99c48564b6f81aaba54a` |
| embeddings, a GGUF of the community | `rodion-m/multilingual-e5-small-gguf`, `multilingual-e5-small-fp32.gguf` | 476 369 248 | `b3bf20a4ba914b630be1941dc3f5136cc99871d8fa2b402564a3b8752cf010c2` |
| embeddings, another GGUF of the community | `keisuke-miyako/multilingual-e5-small-gguf-f16`, `multilingual-e5-small-F16.gguf` | 241 873 728 | `3c3569e72acd821a30f1c586f4d39862407da7da3f08fc7068798e5982b5f6db` |

The volumes: `osionos_ai_models_llm` and `osionos_ai_models_tei` (the ones of the deployment, read only),
`osionos_ai_models_tei_gguf` (the GGUFs of the spike), `osionos_ai_models_e5_hf` and `osionos_ai_models_e5_conv`
(the original files of the model, for the conversion) and `osionos_ai_llama_cpp_tools` (the conversion code of
llama.cpp, patched).

## The requests

The prompt is built by `spikes/gpu/requests.mjs` from the code of the service itself, so it cannot drift:

- the system prompt is read out of `services/osionos-ai/src/runs/prompt.ts` (`SYSTEM_PROMPT`, four lines, 255
  characters, 59 tokens);
- the eight `<source>` blocks are built by `services/osionos-ai/src/runs/sources.ts` (`sourceBlock`,
  `SOURCE_INSTRUCTION`) out of the chunks of `services/osionos-ai/src/indexer/chunker.ts`, applied to the 40
  pages of `services/osionos-ai/eval/corpus/` (291 chunks). The eight chunks are the ones a tf-idf cosine over
  the content words of the corpus returns for the question of the golden set, with at most three chunks per page
  (the rules of `src/retrieval/search.ts`);
- the question comes from `services/osionos-ai/eval/golden.jsonl`;
- **the tool definitions are a stand-in**: the branch has no `src/tools/` directory
  (`git ls-tree -r --name-only origin/feat/ai -- services/osionos-ai/src/ | grep -i tool` answers nothing), so
  seven functions of the shape the AI SDK sends (the OpenAI function format) were written by hand, 4 584 bytes,
  1 042 tokens;
- `max_tokens` is 300, the temperature is 0, `cache_prompt` is true.

The result: a prompt of **2 050–2 122 tokens** (measured with `POST /tokenize` of the server), whose first
**1 101 tokens are the same on every request** (the system prompt and the tools: 59 + 1 042), and whose sources
and question change. The chat template of the model puts the tools right after the system prompt, so the shared
prefix is the first 1 101 tokens of the rendered prompt, and the cache of the server reuses it (the numbers of
`cache_n` below).

The arrivals are Poisson: the gaps are `-ln(1-U)/lambda` with a seeded generator (mulberry32, seed 20261021),
and every request is a streamed `POST /v1/chat/completions`.

## What is measured

- **TTFT**: the time between the request and the first content chunk of the stream.
- **ITL**: the gap between two consecutive content chunks (the server sends one token per chunk).
- **E2E**: the time between the request and the end of the stream.
- **tok/s**: the completion tokens of the window, divided by the length of the window (the arrival process
  included).
- **cache_n / prompt_n**: `timings.cache_n` (the prompt tokens the server reused) and `timings.prompt_n` (the ones
  it had to read) of the same response; their sum is the length of the prompt.
- **deferred**: the peak of `llamacpp:requests_deferred`, polled once a second on `/metrics`.
- **VRAM**: the peak of `/sys/class/drm/card1/device/mem_info_vram_used`, sampled once a second during the run.
- **busy**: the mean of `gpu_busy_percent` over the same samples.
- **loadavg**: the 1-minute load average at the end of the run.
