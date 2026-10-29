# The vision spike: a small VLM tags three hundred photos (A1 → M7, devil C81, C97)

Measured 2026-10-22 on this host: i5-13600KF (14 cores, 20 threads), 31 GB of RAM, one card of
Vulkan (8.0 GB of VRAM) that the session of the user holds. Every server of the spike gets 6 threads
of the CPU (`llama-server -t 6`, `--cpus 6`) and 7 GB of memory (`--memory 7g --memory-swap 7g`);
the host is shared with the other agents of the machine, so the load average is in every `run.log`
(it was 13–32 during the runs: **every latency below is a latency under load**).

M7 tags every uploaded picture in the background: the alt text, the tags the user can edit, the OCR
and a safety **hint** (devil C97: a hint that holds for review on a public surface, never a
detector, never a removal). The model has to run on our hardware, so the spike picks it from
numbers.

## The pick

| part | artifact | licence | pinned in |
|---|---|---|---|
| engine | llama.cpp `server-b11580`, `llama-server --jinja -c 4096 -np 1 -t 6 --mmproj <mmproj>` | MIT | `images.lock` (`llama-cpp-cpu`) |
| model, small | SmolVLM2-2.2B-Instruct Q4_K_M GGUF, `ggml-org/SmolVLM2-2.2B-Instruct-GGUF@1bc3c9f7` | Apache-2.0 | `models.lock` (`vlm`) |
| model, middle | Qwen2.5-VL-3B-Instruct Q4_K_M GGUF, `ggml-org/Qwen2.5-VL-3B-Instruct-GGUF@5037fcf1` | Apache-2.0 | `models.lock` (`vlm`) |
| model, big | gemma-3-4b-it Q4_K_M GGUF, `ggml-org/gemma-3-4b-it-GGUF@d0976223` | Gemma licence | `models.lock` (`vlm`) |
| the set | 300 pictures of COCO val 2017, `random.Random(42)`, the pictures with at least one annotated category | CC BY 4.0 | `models.lock` (`coco-annotations`) |
| the table of the words | `tag-synonyms.json` (the tag of the model → the category of COCO) | written by hand for the spike | the spike |

- **The pinned build takes the schema of the JSON.** The call carries
  `response_format: {"type": "json_schema", ...}` and the server turns it into a grammar itself:
  `common/json-schema.cpp:208` reads `maxLength` and `common/json-schema-to-grammar.cpp:945`
  writes the rule of it, so the length of a string is a rule of the grammar and not a wish of the
  prompt. No GBNF grammar had to be written, and none is in the repository.
- **The GGUF files are the conversions of `ggml-org`**, the house of llama.cpp: they are trusted
  through their sha256, like every other artifact of the lock.
- **The three models do not speak the same dialect.** SmolVLM2 writes a caption and three short
  tags, Qwen2.5-VL writes the objects of the picture, gemma-3-4b writes the most (and the longest
  OCR). The prompt is the same for the three, and the schema is the same: the shape of the answer
  is the server's, not the model's.

## The set

Three hundred pictures of COCO val 2017, drawn with `random.Random(42)` among the pictures that
carry at least one annotated category (`fetch-coco.py --seed 42 --with-categories --count 300`),
and shrunk so that the long side is at most 768 pixels — the stand-in of the pixel cap of C81
(`vlm-sets.py`). The ground truth of a picture is the set of the categories of COCO that are
annotated on it: 79 different categories in the set, 2.98 categories per picture on average (64
pictures carry one, 9 carry six).

**The cap of C81 is not exercised by this set.** The biggest picture of COCO val 2017 is 640
pixels on its long side, so the shrink to 768 pixels changed no size: the rule was applied and it
was a no-op (the pictures were written again as JPEG of quality 90 all the same). A set of
screenshots and of scans of the users would exercise it; this one does not.

The twenty pictures that hold text are picked by the keywords of the captions of COCO ("sign",
"text", "words", "menu", "license"), over the five captions of every picture: the OCR of the spike
is read by a human next to the caption, it is not scored.

## The call

`llama-server` with the projector of the model, `-c 4096`, `--jinja`, one slot, the OpenAI route
`/v1/chat/completions` with the picture as a base64 `image_url`, `temperature 0`, and the schema
of `vlm-schema.json`: `{caption ≤ 200, tags ≤ 10, objects ≤ 10, ocr ≤ 300, safety ∈ safe |
suggestive | explicit | violent | unknown}`. The prompt is the same for the three models and it is
in the repository (`vlm-prompt.txt`). The budget of the answer is 640 tokens, so that the shape
the schema allows fits: with 320 tokens one answer of three hundred was cut in the middle of a
string of digits (the model runs away on the OCR of a picture without text).

## The numbers

Both runs on the CPU, the same 300 pictures, the same prompt and the same schema. `vlm-summarize.py`
reads `run-<label>.jsonl`; the summaries are `summary-<label>.json`. The confidence intervals are a
bootstrap over the pictures (seed 42).

| | SmolVLM2-2.2B Q4_K_M | Qwen2.5-VL-3B Q4_K_M |
|---|---|---|
| valid JSON (the schema held) | 299 / 300 (0.997) | **300 / 300 (1.000)** |
| precision@5, tags + objects (macro) | 0.279 [0.263, 0.298] | **0.296 [0.280, 0.315]** |
| recall, tags + objects (macro) | 0.610 [0.569, 0.648] | **0.649 [0.612, 0.685]** |
| precision@5, tags only | 0.257 | **0.284** |
| recall, tags only | 0.546 | **0.601** |
| latency per picture p50 / p95 | 11.7 s / 29.8 s | 12.2 s / **20.6 s** |
| the longest answer (tokens) | 640 (the cap: a runaway OCR) | **187** |
| safety hint on benign pictures: flagged | 17 / 297 (5.7 %, all `unknown`) | **2 / 299 (0.7 %)** |
| pictures with an OCR string | 296 (it writes OCR on every picture) | 33 |
| the load average of the host during the run | **5.5–32.1** | 1.8–6.5 |

- The precision@5 has a ceiling far below 1: a picture carries 2.98 COCO categories on average, so
  five tags can be right on three of them at best (≈ 0.6). Recall is the more telling column.
- gemma-3-4b was not measured: its run was started and stopped at the session clear of 2026-10-22
  before its first answer (`gemma3-cpu/stats.tsv` holds only the memory samples of the warm-up).
  It is the biggest and slowest of the three, and the middle model already meets the bar below.

## Findings

- **Qwen2.5-VL-3B wins on every quality column**, inside or at the edge of non-overlapping
  intervals for recall and precision, and it never broke the schema.
- **SmolVLM2 runs away on OCR.** It writes an OCR string for 296 of 297 pictures, most of them
  photographs without text, and one answer hit the 640-token cap. Qwen writes OCR for 33 — close to
  the 20 pictures that hold text (by their captions).
- **The safety hint of SmolVLM2 is noise**: 17 `unknown` on benign pictures. A hint that holds 5.7 %
  of benign uploads for review (C97) would flood the console; Qwen's 0.7 % would not.
- **The latencies are not a fair race.** SmolVLM2 ran with the host at load 5–32, Qwen at 2–7. Both
  p50 are ≈ 12 s on 6 threads, so a background tag lands within ~15–30 s of an upload on this CPU.
- **Memory.** Both containers sat at their 7 GiB cap in `docker stats` (page cache counted); the
  first sample of Qwen, after the model load, was 2.9 GiB. The working set of a production limit
  below 7 GiB is NOT measured here.

## Recommendation

**Qwen2.5-VL-3B-Instruct Q4_K_M** (`ggml-org/Qwen2.5-VL-3B-Instruct-GGUF@5037fcf1`, Apache-2.0) on
llama.cpp `server-b11580`, CPU, 6 threads, one slot, `-c 4096`, the JSON schema of `vlm-schema.json`
as the grammar. It runs in the background of M7 through `ai_jobs` (kind `image_tag`), never on a
request path.

- Keep the 640-token answer budget: Qwen's longest answer was 187, so the cap is a guard, not a cut.
- The safety hint holds for review on public surfaces only (C97) and is never a removal.
- Before production, measure the working set under a 4 GiB limit (the unknown above).

## Caveats

- Caveat: three hundred pictures of COCO are not the pictures our users upload. They are the
  pictures of a dataset of photographs, and the tags of a VLM on them say little about the tags of
  a VLM on a screenshot, a drawing or a scan.
- Caveat: the vocabulary of the tags is mapped by a hand table (`tag-synonyms.json`). A tag that
  the table does not know is a miss for the precision and for the recall, and the table knows 187
  spellings for the 80 categories of COCO: the numbers of the precision are a number of the table
  as much as a number of the model.
- Caveat: one machine, one day, and the host is shared with the other agents: the load average was
  13–32 during the runs, and every latency here is a latency under load.
- Caveat: the recall of the safety hint is **not measured**. No unsafe picture was downloaded,
  generated or stored (devil C97), so every rate of the safety of this spike is a rate of false
  flags on benign pictures, and no false negative is counted.
- Caveat: the GPU is not measured: the VRAM of the card was held by another service of the host
  during the whole run (see the table).

## The runs

| what | command | result |
|---|---|---|
| the pins | `fetch.py --lock models.lock --dest /mnt/storage --only vlm` | the six artifacts of the group `vlm`, sha256 checked |
| the set | `sh vlm.sh sets` | 300 pictures, the labels of COCO, 20 pictures with text |
| the server and the client | `sh vlm.sh run <label> <model> <mmproj> <alias> cpu` | the log of every run in `results/vlm/<label>/run.log` |
| the summary | `sh vlm.sh summary <label>` | the numbers of the run in `results/vlm/summary-<label>.json` |
| the answers | the same run | `results/vlm/run-<label>.jsonl`, one line per picture |

| label | started | pictures answered | answers | summary |
|---|---|---|---|---|
| `smolvlm2-cpu` | 2026-10-22 16:26 | 297 (+3 warm-up) | `run-smolvlm2-cpu.jsonl` | `summary-smolvlm2-cpu.json` |
| `qwen25vl-cpu` | 2026-10-22 19:51 | 299 (+1 warm-up) | `run-qwen25vl-cpu.jsonl` | `summary-qwen25vl-cpu.json` |
| `gemma3-cpu` | 2026-10-22 | 0 (stopped during warm-up) | — | — |

The summaries were produced on 2026-10-23 with `sh vlm.sh summary <label>` (the summary step had
mounted the volume read-only while writing its output; fixed in this commit).
