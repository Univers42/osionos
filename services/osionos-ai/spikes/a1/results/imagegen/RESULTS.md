# Image generation on the local GPU (A1 → M1)

Measured 2026-10-22 on this host: AMD RX 6600 8 GiB (RADV NAVI23, Vulkan), i5-13600KF, desktop holding
1.97–2.04 GB of VRAM, load average 2.0–7.8 (shared CPU, recorded per run in each `run.log`).

The user does not want to pay for anything, so the free default is a local model; OpenRouter has no free
image model (2026-10-21 list). Devil verdict: `a2-images-moderation-verdict.md`, C70–C78.

## The pick

| part | artifact | licence | pinned in |
|---|---|---|---|
| engine | stable-diffusion.cpp `master-vulkan`, sd-cli + sd-server | MIT | `images.lock` (`sdcpp-vulkan`) |
| diffusion | Z-Image-Turbo Q4_0 GGUF (`wbruna/Z-Image-Turbo-sdcpp-GGUF@ea7669b5`), 6B single-stream DiT | Apache-2.0 | `models.lock` |
| text encoder | Qwen3-4B-Instruct-2507 Q4_K_M, the chat model's own cached file (`unsloth@a06e946b`) | Apache-2.0 | `models.lock` |
| VAE | `ae-f16.gguf`, same repo | Apache-2.0 | `models.lock` |

- **C73 lineage.** Z-Image-Turbo is Tongyi-MAI's (Alibaba) own model, trained from scratch: not SD 1.x, not a
  community fine-tune. Caveat: stated from the model card (`Tongyi-MAI/Z-Image-Turbo`), not re-verified here;
  the GGUF is a third-party conversion, trusted only through its sha256.
- **Dropped.** SD-Turbo and SDXL-Turbo, both already in `models.lock`, ship under Stability AI's
  non-commercial community licence, and SD-Turbo descends from SD 2.1. The Qwen3-4B Q8_0 encoder that the
  sd.cpp docs pair with Z-Image was not needed: the cached Q4_K_M works, and saved a 4.3 GB download (HF held
  this host at 0.5–1.5 MB/s that night).

## Numbers (512×512, 8 steps, cfg 1.0, Euler)

| run | command | per image | peak VRAM |
|---|---|---|---|
| cold, auto placement (TE + VAE weights in RAM, computed on GPU) | `sh imagegen.sh cold-gpu-512 5` | wall 28.4–30.9 s steady; 43.8 s first (TE 15.1 s, cold page cache); sampling 23.9–32.4 s | 7.14 GiB |
| cold, **text encoder on CPU** | `sh imagegen.sh cold-te-cpu-512 3 --backend te=cpu` | wall **22.5–23.0 s**; TE 0.9–1.2 s, sampling 19.3–19.5 s, decode ~1.2 s | 7.14 GiB |
| **warm, sd-server via the AI SDK** | `sh imagegen-server.sh warm-te-cpu-512 5 --backend te=cpu` | **19.1–19.5 s**; first call 21.3 s (lazy load) | 7.26 GiB |

- The text encoder on the CPU is faster on every axis: the VAE weights then fit in VRAM, and the sampler
  stops sharing its compute reserve. It becomes the default.
- Peak VRAM is the card total. Auto-fit plans against the free VRAM (budget 5785 MiB of 6297 free), so it takes
  what the desktop leaves: ~5.2 GB here.
- Quality: `cold-gpu-512/01.png` (fox, newspaper, snow) and `03.png` (top-down ramen, soft-boiled eggs,
  scallions) follow their prompts.

## C71 — the wire

`imagegen-wire.mjs`, run inside `track-binocle/osionos-ai:ai-dev` (`ai@7.0.139`,
`@ai-sdk/openai-compatible@3.0.68`): `generateImage({ model: provider.imageModel(…), size: '512x512', n: 1 })`
against sd-server's `/v1/images/generations`. 5/5 calls: body keys exactly `model, n, prompt, size`, one PNG
512×512 back as `b64_json`, `mediaType: image/png`, no warnings.

## Findings the M1 slice must act on

1. **`usage` comes back `{}`.** Nothing to price by tokens: settlement is per image (C74), and on the local
   path the per-user count is the only limiter (C75).
2. **The seed is only settable inside the prompt.** A top-level `seed` field is ignored (log: `seed 42`); the
   text `<sd_cpp_extra_args>{"seed": 9}</sd_cpp_extra_args>` in the prompt sets it (log: `seed 9`). Whatever a
   user types there reaches the generation parameters (steps, size…): the service refuses a prompt carrying
   that tag and appends its own, seed only. Without a seed every repeat of a prompt is byte-identical (calls 1
   and 4), so "variations" (C72: new seed, same prompt) depend on this.
3. **The prompt is written into the PNG.** A `tEXt` chunk `parameters` holds the prompt, seed and settings.
   Stored byte-exact behind a capability URL, it would hand the private prompt to every reader (C77).
   `--disable-image-metadata` turns it off; the slice asserts the stored PNG has no text chunk.
4. **sd-server also serves `/v1/images/edits`** (image-to-image). The service never calls it (C72), and the
   server sits on the internal network only.
5. **The engine image is a master build hours old** (`images.lock`). The slice pins a release at least 7 days
   old.

## C75 — sharing the machine

| measure | command | result |
|---|---|---|
| chat TTFT, CPU llama.cpp (ai-dev-llm), ~20-token uncached prompts | `imagegen-contention.mjs`, `contention-te-cpu/run.log` | idle 206–271 ms; during an image 181–296 ms — no measurable impact |
| GPU chat model start (llama.cpp Vulkan, P0d config 3) | `swap/run.log` | ready 2.1–2.2 s (4.7 s cold page cache), 3.05 GB VRAM |
| sd-server start | `warm-te-cpu-512/run.log` | ready 1.7 s, then ~2 s of lazy load inside the first call |

- ai-dev runs chat on the CPU, so the GPU has one tenant: images, through a concurrency-1 queue (C75).
- A GPU chat model (3.05 GB) and Z-Image (~5.2 GB) do not fit together on this card. Swapping costs
  ~2 s each way with a warm page cache; that is only needed if chat ever moves to the GPU here.
- Caveat: the contention test used short prompts. A long uncached prefill (RAG context) overlaps the ~1 s CPU
  text-encode for longer; not measured.
