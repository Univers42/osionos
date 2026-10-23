# AI evaluation pack

The seven AI modules of chapter IV.4, the sheet that proves each one, and the
headline number with the command that produced it. The confidence letters are
the legend of the groot README's Modules table: **A** works in the default
local stack with the documented profile and no code change; **B** needs a flag;
**C** needs a screen. A row is never **A** when its sheet says the demonstration
needs something that is off, unmeasured or blocked.

The evaluation runs locally. The public stack is not the demonstration stack:
it switches several of these modules off, and the confidence cell says where.

| Module | Type and points | Sheet | Headline number and command | Confidence |
|---|---|---|---|---|
| M1 — Complete LLM system interface (text + images) | Major, 2 | [m1-images.md](modules/m1-images.md) | End to end in the browser (`/imagine` → stored image), ai-dev, 2026-10-22: **22.4 s**, usage `{"images": 1, "costMicroUsd": 2000}`; command `ai_runs.ended_at - created_at` | **B** — `OSIONOS_AI_IMAGES=on` with `--profile ai --profile ai-gpu-vulkan`; the prompt-guard service is not deployed (C72), so the service refuses to start. Off on the public stack (`OSIONOS_AI_IMAGES` empty). |
| M2 — Complete RAG on a large dataset | Major, 2 | [m2-rag.md](modules/m2-rag.md) | **110363 chunks / 17001 pages**; variant 1 recall@5 **0.806 [0.738, 0.869]**; command `node --experimental-strip-types eval/wiki/measure-rag.ts` (the docker invocation is in the sheet) | **A** — `--profile ai`; the citations flow works on the ai-dev stack. The reranker and abstention are off by default, and the 110k corpus is not on the eval stack. |
| M3 — ML recommendation system | Major, 2 | [m3-recs.md](modules/m3-recs.md) | iALS **0.1154** nDCG@10 against popularity **0.0775**, SYNTHETIC; command `(cd services/osionos-ml && OPENBLAS_NUM_THREADS=1 python -m osml.evaluate)` | **B** — `OSIONOS_RECS_FOR_YOU=1`; the beacon is opt-in and off by default, and the nightly job skips with `insufficient_data` under 20 users. |
| M4 — Content moderation AI | Minor, 1 | [m4-moderation.md](modules/m4-moderation.md) | Best HateCheck precision **0.776** (en) / **0.798** (fr) / **0.785** (es), no threshold reaches **0.95**; command: none in the sheet (numbers read from `services/osionos-ai/spikes/a1/results/encoders/RESULTS.md:24-41`) | **B** — `OSIONOS_MODERATION_ACTIONS=hold` and `OSIONOS_MODERATION_STATE=1`; L1 is log-only, never auto-remove. The public stack runs `log`. |
| M5 — Voice / speech | Minor, 1 | [m5-voice.md](modules/m5-voice.md) | WER **en_us 0.064 (95 % CI [0.051, 0.079])**, **fr_fr 0.128 ([0.106, 0.150])**, **es_419 0.049 ([0.039, 0.061])**; measured with `services/osionos-ai/spikes/a1/stt.sh` (see `services/osionos-ai/spikes/a1/stt-bench.py`) | **A** — `--profile ai` with the STT model fetched into its volume; the route is off on the public stack (`503 voice_unavailable`). The read-aloud voices are **TO MEASURE** on this host. |
| M6 — Sentiment analysis | Minor, 1 | [m6-sentiment.md](modules/m6-sentiment.md) | Macro-F1 **en 0.712**, **fr 0.723**, **es 0.697**; command `cd services/osionos-ai/spikes/a1 && sh encoders.sh sentiment2` | **C** — an owner or admin enables it in Settings › AI (a screen); the isolated ai-dev stack needs `OSIONOS_SENTIMENT_URL` and the sentiment migration. Off on the public stack; the model licence is undeclared. |
| M7 — Image recognition and tagging | Minor, 1 | [m7-images-tags.md](modules/m7-images-tags.md) | Valid JSON **300 / 300 (1.000)**, recall **0.649 [0.612, 0.685]**, precision@5 **0.296 [0.280, 0.315]**, latency p50 **12.2 s** / p95 **20.6 s**; command: none in the sheet (`summary-qwen25vl-cpu.json`, `results/vlm/RESULTS.md`) | **C** — `--profile ai --profile ai-vlm` and the VLM files in `osionos_ai_a1_data`; the browser flow and the in-app search are unverified. Off on the public stack (`OSIONOS_AI_VLM_URL` empty). |

Listed AI points: 2 + 2 + 2 + 1 + 1 + 1 + 1 = **10**. Demonstrable now, A rows
only: M2 2 + M5 1 = **3 points**. Added to the groot README's 21 listed and 10
demonstrable points, these rows make **31 listed** and **13 demonstrable**;
the 14-point requirement is still not met.

## What this project does not do

- **The AI-opponent module (a game).** Out of scope: the
  [groot README](https://github.com/Univers42/groot/blob/develop/README.md#known-limitations)
  says "No game. All gaming-dependent modules are out of scope", and no sheet
  in `modules/` covers it (the seven sheets are M1–M7).
- **A Claude subscription through a local engine.** [local-engine.md](local-engine.md)
  says it in one line: "Claude Pro/Max is **not** offered through this path —
  Anthropic explicitly prohibits it."
- **The ML moderation removing content by itself.** [m4-moderation.md](modules/m4-moderation.md)
  says "L1 runs in `log` mode on the public stack" and "There is no auto-removal
  anywhere", because on HateCheck no threshold reaches a precision of 0.95; it
  "ships log-only plus hold-for-review, never auto-remove". A human decides,
  always, until the precision floor is met.
