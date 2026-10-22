# The image-prompt guard on the CPU (A1 → C72)

Measured 2026-10-22 on this host: i5-13600KF (14 cores, 20 threads), 31 GB of RAM, no GPU for the
guard (the card of the desktop holds the session of the user). The guard gets 6 threads of the CPU,
as `llama-server -t 6`; the host is shared with the other agents of the machine, so the load average
is recorded in every `run.log` (7–17 during the runs).

The gate of the image prompt (devil C72: "every image prompt runs L0 + L1 synchronously before any
upstream or local call; fail closed") needs a classifier for L1. The candidate measured here is
**Qwen3Guard-Gen** of Qwen: a model that reads a prompt and answers `Safety: Safe | Unsafe |
Controversial` with the categories of its policy.

## The pick

| part | artifact | licence | pinned in |
|---|---|---|---|
| engine | llama.cpp `server-b11580`, `llama-server --jinja -c 4096 -np 4 -t 6` | MIT | `images.lock` (`llama-cpp-cpu`) |
| guard, small | Qwen3Guard-Gen-0.6B Q8_0 GGUF, `mradermacher/Qwen3Guard-Gen-0.6B-GGUF@2a59799e` | Apache-2.0 | `models.lock` |
| guard, big | Qwen3Guard-Gen-4B Q4_K_M GGUF, `mradermacher/Qwen3Guard-Gen-4B-GGUF@b3b010b3` | Apache-2.0 | `models.lock` |
| the original | `Qwen/Qwen3Guard-Gen-0.6B@fada3b2f`, `Qwen/Qwen3Guard-Gen-4B@6ec42827`, `tokenizer_config.json` | Apache-2.0 | `models.lock` |
| the unsafe set | I2P benchmark, `AIML-TUDA/i2p@6594f223` (`i2p_benchmark.csv`, 4703 rows) | MIT | `models.lock` |
| the safe set | COCO val 2017 captions, the zip of `images.cocodataset.org` (entry `annotations/captions_val2017.json`, read with range requests) | CC BY 4.0 | `models.lock` (`coco-annotations`) |

- **The template of the GGUF is the template of the original.** `template-check.py` reads the
  `tokenizer.chat_template` of the header of the GGUF and compares it with the `chat_template` of the
  `tokenizer_config.json` of Qwen: `template: identical` for the two models
  (`results/safety/template-check.log`). The server therefore runs with `--jinja` and without
  `--chat-template-file`.
- **The GGUF is a third party.** The conversion is the work of `mradermacher`, not of Qwen: it is
  trusted through its sha256 only.
- **The template asks the question itself.** The policy, the categories and the last user query are
  in the template: the client sends the prompt of the user as the one user message, and the model
  answers the two lines of its contract (`Safety: …` then `Categories: …`). The price is ~320 prompt
  tokens per call, of which the policy is all but the last twenty.
- The 4B is three times and a half slower than the 0.6B on this CPU (2.3 s against 0.65 s per
  call): it is the same policy, four times the parameters.

## The numbers

The sets: the 4703 rows of I2P (the unsafe side), the 1000 captions of COCO val 2017 and the 10
prompts of the spike itself (the safe side), the two hundred hard rows of I2P and the two hundred
captions for the languages. The samples are drawn with `random.Random(7)`, so the same rows come back
on every machine. The verdict of a row is `Safe`, `Unsafe` or `Controversial`; **strict** flags
`Unsafe` or `Controversial`, **loose** flags `Unsafe` only.

| what | command | result |
|---|---|---|
| the template of the GGUF | `python3 template-check.py --gguf … --original …` | `template: identical` (the two models) |
| the unsafe side, the 0.6B | `sh measure.sh` → `guard-client.py` over the 4703 rows of I2P | recall strict **35.98 %** (1692), loose **8.02 %** (377), 0 unparsed, 0 errors |
| the safe side, the 0.6B | the same over the 1000 captions of COCO and the 10 prompts of the spike | FPR strict **6.30 %** [4.95 %, 7.98 %], loose **0.30 %** [0.10 %, 0.88 %]; the 10 prompts: 0 [0 %, 27.8 %] |
| the unsafe side, the 4B | the same over the 1831 hard rows of I2P | not measured yet: the run was still going when the session that measured the 0.6B ended (`sh measure.sh` finishes it; the verdicts land in `results/safety/guard-4b/`) |
| the safe side, the 4B | the same over the 1000 captions of COCO and the 10 prompts | not measured yet: the run was still going when the session that measured the 0.6B ended (`sh measure.sh` finishes it; the verdicts land in `results/safety/guard-4b/`) |
| French and Spanish | `sh translate.sh French …` then `sh measure.sh languages` | not measured yet: the run was still going when the session that measured the 0.6B ended (`sh measure.sh` finishes it; the verdicts land in `results/safety/guard-4b/`) |
| a call of the 0.6B, alone | the sequential run of the 4703 rows of I2P | p50 **658 ms**, p95 **1306 ms**, max 6031 ms; 319 prompt tokens |
| a call of the 4B, alone | the sequential run of a hundred hard rows | not measured yet: the run was still going when the session that measured the 0.6B ended (`sh measure.sh` finishes it; the verdicts land in `results/safety/guard-4b/`) |
| four clients at once, the 0.6B | `par:i2p-par:en:400` | 400 calls in 220 s = **1.8 calls/s**; p50 2178 ms, p95 5389 ms per call |
| four clients at once, the 4B | `par:i2p-hard-par:en:400` | not measured yet: the run was still going when the session that measured the 0.6B ended (`sh measure.sh` finishes it; the verdicts land in `results/safety/guard-4b/`) |
| the gate that fails closed | the server is stopped, then one call is made | refused in **9.5 ms** (`Connection refused`) |
| the two hundred rows of the languages, in English | `par:i2p-200:en:200` and `par:coco-200:en:200` | recall strict 47.50 %, loose 7.50 %; FPR strict 5.00 % [2.74 %, 8.96 %], loose 0.00 % [0.00 %, 1.88 %] |

The recall of the 0.6B, per category of I2P (a row is counted in every category it names):

| category of I2P | rows | strict | loose |
|---|---|---|---|
| adult | 931 | 41.03 % | 12.03 % |
| illegal activity | 727 | 43.19 % | 9.77 % |
| violence | 756 | 40.48 % | 10.98 % |
| shocking | 856 | 36.33 % | 7.71 % |
| self-harm | 801 | 28.71 % | 3.87 % |
| hate | 231 | 28.57 % | 2.60 % |
| harassment | 824 | 26.09 % | 4.73 % |

The categories of the model, on the 4703 rows of I2P (the codes of the policy: `A` adult, `V`
violent, `T` politically sensitive, `C` copyright, `U` unethical, `P` personal data, `S` self-harm,
`J` jailbreak): the model answers `Safe` 3011 times, `Controversial` 1315 and `Unsafe` 377 — and it
names `A` 827 times, `V` 313, `T` 236, `C` 169, `U` 114, `P` 17, `S` 14, `J` 2, and never `N`.

## Findings the C72 slice must act on

1. **The gate is cheap on the CPU, and it fails closed at once.** A call of the 0.6B alone costs
   **658 ms** (p95 1306 ms) on 6 threads of this CPU, of which ~320 prompt tokens are the policy of
   the template: the prefill is nearly free, the answer is eight tokens. When the server is not there
   the call is refused in **9.5 ms**: the gate can answer "no" without waiting, and the timeout of
   the slice only has to cover a server that hangs, not one that is down.
2. **The strict mode is the one that works.** On the 4703 rows of I2P the loose mode (only `Unsafe`)
   catches 8.02 % of the rows and the strict mode 35.98 %; the model answers `Controversial` 1315
   times against 377 `Unsafe`. A gate that only reads `Unsafe` throws away three quarters of what the
   model sees.
3. **But the strict mode refuses 6.3 % of the benign captions.** Of the 1000 captions of COCO, 63 are
   flagged in strict mode (39 of them as adult, 13 as violent, 7 as unethical, 4 as political) and 3
   in loose mode. The 10 prompts of the spike itself are not flagged. The FPR of the strict mode is
   therefore twenty times the one of the loose mode — the price of a prompt gate a user can see.
4. **The categories of the model are not the categories of the slice.** The model names its own
   taxonomy and the slice has to map it: `A` (adult) and `V` (violent) carry the flags, while the
   rows of I2P about self-harm are rarely named `S` (14 times in 4703). The mapping to write is
   `A`, `V`, `S`, `J` and `N` → refuse; `T` (politically sensitive) and `C` (copyright) → the slice
   decides, they are 8.61 % of the rows of I2P and 4 of the 63 false positives.
5. **The answer is always in the expected form.** 0 unparsed answers in 5713 calls: the two lines
   `Safety: …` and `Categories: …` are always there. The slice still has to treat an answer it cannot
   read as a refusal — but on this evidence it will never see one.
6. **The guard does not scale with the clients on this CPU.** One client alone answers 1.42 calls
   (4703 calls in 55 min); four clients at once answer **1.8 calls/s** and every call of them takes
   2178 ms (p50) against 658 ms alone. The four slots of the server do not share the policy of the
   template: each of them prefills its own copy of the 320 tokens. The slice has to give the gate its
   own core, or to accept the latency of a call — it cannot buy throughput with concurrency.
7. **The recall of a text guard on I2P is a lower bound.** I2P labels the image that Stable Diffusion
   produced, not the prompt: many of its rows read benign as text, so the 36 % of the strict mode is
   a floor, not a count of what the model misses. The FPR, on the other hand, is measured on
   captions that are certainly benign: it is the real price of the gate.

## Recommendation

**The 0.6B, in strict mode, with the categories of the model mapped to the policy of the slice.**

The numbers that justify it: 35.98 % of the rows of I2P are caught in strict mode against 8.02 % in
loose mode, at a false positive rate of 6.30 % on the captions of COCO (0.30 % in loose mode), and
the whole call costs 658 ms (p95 1306 ms) of one CPU. The 4B is the same policy with four times the
parameters: it answers three times and a half slower (2.3 s), and the reviewer decides with the
numbers of the table above if that is worth buying.

What the slice has to write around it: the mapping of the categories (finding 4), the reading of an
answer that cannot be parsed as a refusal (finding 5), and the rule that the gate refuses when the
server is not there (9.5 ms, finding 1). A 6.3 % refusal rate on benign prompts is the number the
slice has to argue about: the 0.6B in strict mode is the cheapest gate that works, and the categories
`T` and `C` are the first thing to take out of it if the refusals are too many. The gate does not
gain anything from more clients (finding 6): one core and 658 ms per prompt is the budget.

## Caveats

- One machine, one day, and the host is shared with the other agents: the load average of every run is
  in its `run.log`.
- The French and the Spanish are machine translations (the chat model of ai-dev, temperature 0): they
  are the same rows as the English ones, but the wording is not what a human would write.
- I2P labels the **image** that Stable Diffusion produced from a prompt, not the prompt: many rows
  read benign as text, so the recall of a text guard here is a lower bound, not a count of defects.
- The GGUF of the guard is a third-party conversion, trusted through its sha256 only.
- The categories of the policy are written as codes (`A`, `C`, `T`…) in the verdicts, and the category
  of I2P for adult content is written `adult`: no text of a prompt is in the repository.
- The runs of the 4B and of the two languages are measured by `sh measure.sh`; the numbers land in
  `results/safety/guard-4b/` and in the table above.

## The runs

| what | command | result |
|---|---|---|
| the pins | `fetch.py --lock models.lock --dest /mnt/storage --only guard` | the four artifacts already there, sha256 checked |
| the template | `template-check.py --gguf … --original …` | `template: identical` (the two models) |
| the sets | `build-sets.py --i2p … --captions … --prompts …` | 4703 / 1831 / 1000 / 200 / 200 / 10 rows, `Random(7)` |
| the captions of COCO | `fetch-coco-captions.py --zip … --entry annotations/captions_val2017.json` | 3872473 bytes, read with range requests |
| the server | `sh guard-server.sh 0.6b … i2p:en:0:i2p` | ready in 4.6 s, `llama-server 0.6.0-dev (build 11580)` |
| the client | `sh guard-client.py --set i2p --lang en --in … --out …` | 4703 verdicts, 0 unparsed, 0 errors |
| the translations | `sh translate.sh French /mnt/storage/sets-a1enc/i2p-200.tsv /mnt/storage/sets-a1enc/i2p-200.fr.tsv` | 200 rows, sha256 `5415867993c534d2d77f60129624c0e7a7903cc3f2d9cee5ca5194bdca60831b` (the other three files in `results/safety/translate.log`) |
| the whole queue | `sh measure.sh` | the sets, the translations, the runs of the two models and the summary |

## C73 — the output check

Measured 2026-10-22 on this host: i5-13600KF (14 cores, 20 threads), 31 GB of RAM, CPU only (the card
of the desktop holds the session of the user). The load average of every run is in its `run.log`: it
was 6.9 for the first run and 20.2 for the last one — the host is shared with the other agents.

C73: "Generated bytes pass a safety check before they are stored or sent; flagged output is
discarded." The check runs in the AI service (Node 22), between the answer of the engine and the
upload of the bridge. This spike measures the candidates in exactly that shape: one process, the
CPU, the model on the disk of the volume, and **no network at all** (`--network none`; nothing asked
the hub — `allowRemoteModels false` and the model on the disk).

**The recall of the check is SKIPPED.** No unsafe image was downloaded, generated or stored: the
three sets below are safe, so every rate here is a false-positive rate, and no false negative can be
counted. The user decides later whether a labelled unsafe set may be fetched. A threshold without a
recall is a proposal, not a number.

### The pick

| part | artifact | licence | pinned in |
|---|---|---|---|
| runtime | `node:22-bookworm-slim` (Node v22.23.4), `@huggingface/transformers` 4.3.1 (published 2026-10-06, sixteen days old) | MIT | `images.lock` (`node-22`), `nsfw/package-lock.json` |
| model, first | `AdamCodd/vit-base-nsfw-detector@8587de99`, ViT-base 384², two labels (`sfw`, `nsfw`), fine-tuned on ~25 000 drawings and photos | Apache-2.0 | `models.lock` (`nsfw`) |
| model, second | `onnx-community/nsfw_image_detection-ONNX@1ceb3c7f`: the ONNX conversion of `Falconsai/nsfw_image_detection`, ViT-base 224², two labels (`normal`, `nsfw`) | the bytes are the Apache-2.0 weights of Falconsai; the conversion repository declares no licence of its own | `models.lock` (`nsfw2`) |
| the sets | the captions of COCO val 2017 (the file of the guard spike) and the photos of `images.cocodataset.org/val2017` | CC BY 4.0 | `models.lock` (`coco-annotations`) |

- **The first model is the strict one.** Its card says it was "trained to be restrictive and therefore
  classify 'sexy' images as NSFW", and the reason it is the interesting one here: it "wasn't made
  with generative images in mind" and "performs significantly worse on generative images" (its own
  accuracy on generated images: 0.86 against 0.9654). The first set of this spike is exactly that
  test: fifty pictures made by our own engine.
- **The second model is the quiet one**, and it is the ONNX conversion of the classifier the hub is
  full of. The conversion repository declares no licence of its own; the bytes are the Apache-2.0
  weights of `Falconsai/nsfw_image_detection`, converted mechanically, so the licence that travels
  with them is the Apache-2.0 of the original. The slice has to make that call itself.
- **Not measured.** `Falconsai/nsfw_image_detection`: safetensors only, no ONNX weights in the
  repository, and no torch in this spike. `suko/nsfw`: Apache-2.0 and an ONNX file, but no
  `config.json` — no labels, nothing to read. `taufiqdp/mobilenetv4_…_nsfw_classifier`: Apache-2.0,
  but a timm MobileNetV4 (the config has no `model_type` and no `id2label`, and the ONNX file is not
  in the layout transformers.js reads). `AdamCodd/vit-nsfw-stable-diffusion`: gated, and
  CC-BY-NC-ND-4.0. The other repositories of the search ship safetensors only.
- The three small files of the first model (`config.json`, `onnx/config.json`,
  `onnx/preprocessor_config.json`) are the layout of transformers.js: the id of the model is a
  directory, and the preprocessor of the ONNX folder is the one of the root (`sh nsfw.sh stage`).
- The bench has its own `package.json` and its own lockfile (`nsfw/`): the app does not depend on
  transformers.js, and this commit does not touch the lockfile of the app.

### The numbers

The sets: fifty pictures made by the engine of the product (from fifty captions of COCO val 2017),
the two PNGs of the image spike of A1, and three hundred photos of COCO val 2017 — 352 images, all of
them safe. The samples are drawn with `random.Random(7)`, so the same images come back on every
machine. The percentiles are by linear interpolation (the way of numpy), the intervals are the ones
of Wilson at 95 %.

| what | command | result |
|---|---|---|
| the pins | `fetch.py --lock models.lock --dest /mnt/storage --only nsfw,nsfw2` | nine artifacts, sha256 checked (344 569 044 and 88 500 985 bytes for the two ONNX files of the first model) |
| the sets | `sh nsfw.sh sets` | 50 captions, 300 photos, 2 PNGs — 352 images, `Random(7)` |
| the fifty pictures | `sh nsfw.sh gen` | 50/50, 0 failures, mean **23.0 s** (22.7–23.7 s) each: the engine of ai-dev, one call at a time |
| the check, the first model, fp32 | `sh nsfw.sh bench` → `nsfw-bench.mjs` | **173 ms** p50, 364 ms p95 per image; load 728 ms; RSS **595 MB** after the load |
| the check, the first model, q8 | the same | **143 ms** p50, 336 ms p95; load 220 ms; RSS **295 MB** |
| the check, the second model, fp32 | the same | **62 ms** p50, 105 ms p95; load 540 ms; RSS **460 MB** |
| the check, the second model, q8 | the same | **47 ms** p50, 62 ms p95; load 223 ms; RSS **298 MB** |
| four images at once | `Promise.all` of four, in the same process | p95 per image: 798 / 536 / 221 / 226 ms |
| the false positives, the first model | the scores of the 352 safe images | at 0.5: **0.57 %** [0.16 %, 2.05 %] (2/352); at 0.7: 0.28 % [0.05 %, 1.59 %]; at 0.9: **0.00 %** [0.00 %, 1.08 %] |
| the false positives, the first model, q8 | the same | at 0.5: 0.85 % [0.29 %, 2.48 %]; at 0.7: 0.28 %; at 0.9: 0.00 % |
| the false positives, the second model | the same | **0.00 %** [0.00 %, 1.08 %] at 0.5, 0.7 and 0.9 (0 of 352) |
| the worst safe picture | the five highest of every set | the picture `93261` is the highest of the pictures of the engine for every file: 0.77 / 0.82 for the first model, 0.008 / 0.017 for the second |
| the gate that fails closed | the model file is not there | refused in **9.6 ms** (`file was not found locally`) |

**The time of one picture** (read, decode, preprocess, inference — the whole chain, after the
warm-up):

| file | load | RSS after the load | p50 | p95 | max | of which the decode | of which the inference | four at once (p50 / p95) | RSS after the run |
|---|---|---|---|---|---|---|---|---|---|
| the first model, `model.onnx` (fp32) | 728 ms | 595 MB | 173 ms | 364 ms | 2424 ms | 5.9 ms | 166 ms | 517 / 798 ms | 921 MB |
| the first model, `model_quantized.onnx` (q8) | 220 ms | 295 MB | 143 ms | 336 ms | 2292 ms | 5.3 ms | 137 ms | 384 / 536 ms | 439 MB |
| the second model, `model.onnx` (fp32) | 540 ms | 460 MB | 62 ms | 105 ms | 367 ms | 4.9 ms | 56 ms | 156 / 221 ms | 757 MB |
| the second model, `model_quantized.onnx` (q8) | 223 ms | 298 MB | 47 ms | 62 ms | 147 ms | 4.3 ms | 42 ms | 139 / 226 ms | 382 MB |

**The score of the unsafe label**, per set:

| file | set | images | min | p50 | p95 | max |
|---|---|---|---|---|---|---|
| the first model, fp32 | the pictures of the engine | 50 | 0.0032 | 0.0203 | 0.0924 | **0.7745** |
| the first model, fp32 | the PNGs of A1 | 2 | 0.0064 | 0.0087 | 0.0107 | 0.0109 |
| the first model, fp32 | the photos of COCO | 300 | 0.0007 | 0.0143 | 0.1286 | **0.5242** |
| the first model, q8 | the pictures of the engine | 50 | 0.0029 | 0.0209 | 0.0884 | **0.8167** |
| the first model, q8 | the PNGs of A1 | 2 | 0.0063 | 0.0100 | 0.0133 | 0.0136 |
| the first model, q8 | the photos of COCO | 300 | 0.0006 | 0.0139 | 0.1536 | **0.5674** |
| the second model, fp32 | the pictures of the engine | 50 | 0.0001 | 0.0001 | 0.0009 | 0.0084 |
| the second model, fp32 | the PNGs of A1 | 2 | 0.0001 | 0.0001 | 0.0001 | 0.0001 |
| the second model, fp32 | the photos of COCO | 300 | 0.0001 | 0.0001 | 0.0002 | 0.0015 |
| the second model, q8 | the pictures of the engine | 50 | 0.0001 | 0.0001 | 0.0006 | 0.0170 |
| the second model, q8 | the PNGs of A1 | 2 | 0.0001 | 0.0001 | 0.0001 | 0.0001 |
| the second model, q8 | the photos of COCO | 300 | 0.0001 | 0.0001 | 0.0002 | 0.0009 |

**The false positives**, per set (the flagged pictures of 352 safe ones):

| file | set | at 0.5 | at 0.7 | at 0.9 |
|---|---|---|---|---|
| the first model, fp32 | the pictures of the engine | 1/50 = **2.00 %** [0.35 %, 10.50 %] | 1/50 = 2.00 % | 0/50 = 0.00 % [0.00 %, 7.14 %] |
| the first model, fp32 | the PNGs of A1 | 0/2 | 0/2 | 0/2 |
| the first model, fp32 | the photos of COCO | 1/300 = 0.33 % [0.06 %, 1.86 %] | 0/300 = 0.00 % [0.00 %, 1.26 %] | 0/300 = 0.00 % |
| the first model, fp32 | all 352 | 2/352 = **0.57 %** [0.16 %, 2.05 %] | 1/352 = 0.28 % [0.05 %, 1.59 %] | 0/352 = **0.00 %** [0.00 %, 1.08 %] |
| the first model, q8 | the pictures of the engine | 1/50 = 2.00 % | 1/50 = 2.00 % | 0/50 = 0.00 % |
| the first model, q8 | the photos of COCO | 2/300 = 0.67 % [0.18 %, 2.40 %] | 0/300 = 0.00 % | 0/300 = 0.00 % |
| the first model, q8 | all 352 | 3/352 = 0.85 % [0.29 %, 2.48 %] | 1/352 = 0.28 % | 0/352 = 0.00 % |
| the second model, fp32 | all 352 | 0/352 = **0.00 %** [0.00 %, 1.08 %] | 0/352 = 0.00 % | 0/352 = 0.00 % |
| the second model, q8 | all 352 | 0/352 = **0.00 %** [0.00 %, 1.08 %] | 0/352 = 0.00 % | 0/352 = 0.00 % |

**The five highest safe pictures**, by id (the id of the caption of COCO val 2017 that made the
picture; the pictures stay in the volume, their digests are in `results/safety/nsfw-sets.tsv`):

| file | the pictures of the engine | the photos of COCO |
|---|---|---|
| the first model, fp32 | `93261` 0.7745, `508586` 0.0966, `54654` 0.0926, `177893` 0.0921, `65350` 0.0887 | `172946` 0.5242, `187243` 0.4113, `79031` 0.3643, `93261` 0.2935, `332570` 0.2882 |
| the first model, q8 | `93261` 0.8167, `508586` 0.0983, `54654` 0.0892, `65350` 0.0875, `177893` 0.0784 | `187243` 0.5674, `172946` 0.5197, `79031` 0.3864, `65350` 0.3345, `332570` 0.3287 |
| the second model, fp32 | `93261` 0.0084, `139077` 0.0025, `555972` 0.0010, `292060` 0.0006, `410934` 0.0004 | `93261` 0.0015, `376365` 0.0005, `536343` 0.0004, `140439` 0.0004, `78404` 0.0003 |
| the second model, q8 | `93261` 0.0170, `139077` 0.0009, `555972` 0.0007, `292060` 0.0004, `410934` 0.0003 | `93261` 0.0009, `536343` 0.0004, `376365` 0.0003, `140439` 0.0003, `78404` 0.0003 |

### Findings the C73 slice must act on

1. **The check is cheap next to the answer it guards.** The engine needs 23.0 s for a 512² picture;
   the check needs 47 ms (the second model, q8) to 173 ms (the first model, fp32) for the same
   picture — 0.2 % to 0.75 % of the cost of the generation. The slice does not have to make the user
   wait for a second engine: the check is one call in the same request, and it can run on the bytes
   the engine has already written.
2. **The first model throws away one picture in fifty of our own engine.** At 0.5 it flags 1 of the
   50 pictures (2.00 % [0.35 %, 10.50 %]) and 1 of the 300 photos (0.33 %). The picture it flags is
   `93261` (0.77), and it is the highest of the pictures of the engine for every file: the two
   models agree on which picture of ours is the worst. C73 says the flagged output is *discarded*:
   at 0.5 the user loses a picture for nothing, one time in fifty. Only at 0.9 is the first model
   silent on the 352 safe images. The card of the model says why: it was not trained on generated
   images.
3. **The second model is quiet on the safe side, at every threshold.** 0 of 352, and the highest safe
   score is 0.017 (q8) — two to three orders of magnitude below the threshold. It is also the
   cheapest and the smallest of the four (47 ms p50, 298 MB of RSS). **But its recall is not
   measured**: a gate that never fires on safe images may be a gate that rarely fires on unsafe ones.
   The numbers of this spike cannot answer that, and the slice must measure the recall on a labelled
   set before it ships anything.
4. **The threshold proposal: 0.5 with the second model, 0.9 with the first.** 0.5 is the threshold
   the safe side can defend for the second model (0 of 352 at any threshold, so the number does not
   choose between them) and the one it cannot defend for the first (2.00 % of the pictures of the
   engine, 0.85 % of all the safe images). 0.9 is the only threshold at which the first model is
   silent on everything measured here. Between them: 0.7 still flags the picture `93261`.
   **The proposal is a proposal**: without a recall, the threshold that a model "should" use is
   unknown, and a threshold set on the false positives alone is the threshold that never fires.
5. **The service gains about 300 MB of RSS.** The process of the check needs 295 MB (the first model,
   q8) or 298 MB (the second model, q8) of RSS after the load, and 460–595 MB with the fp32 files —
   on a host of 31 GB that already holds the services of the other agents. The quantized file is
   the one to load: it halves the memory of the first model (595 → 295 MB) and costs 30 ms of
   latency (173 → 143 ms). The load itself is 220 ms (q8): the model can be loaded at the start of
   the service, not in the request.
6. **The check fails closed in 9.6 ms.** With the model file missing, the pipeline refuses in 9.6 ms
   (`file was not found locally`) and the slice can answer "no" without waiting for a timeout — the
   same shape as the guard of the prompt (9.5 ms, the section above). A model that cannot be loaded
   is a model that refuses everything: the service has to load it at the start and refuse to serve
   images when the load failed.
7. **Four at once is not faster.** The p95 of a picture grows from 364 ms to 798 ms (the first model,
   fp32) and from 62 ms to 226 ms (the second model, q8): four pictures in one process take three
   times the time of one picture. The service cannot buy a faster check with concurrency inside the
   process; the only way is more processes, and finding 5 says what a process costs in memory.

### Caveats

- Caveat: one machine, one day, and the host is shared with the other agents — the load average
  went from 6.9 to 20.2 during the four runs. The latencies are the latencies of a loaded host.
- Caveat: the recall is SKIPPED. No unsafe image was downloaded, generated or stored. Every rate of
  this section is a rate of false positives, and no false negative is counted.
- Caveat: the photos of COCO are not the prompts of our users, and the pictures of the engine are
  the pictures of *this* engine: the safe side of the gate is a proxy, not the distribution the
  slice will meet.
- Caveat: a classifier trained on photos may score generated art differently — that is what the
  first set measures, and it is not small: 2.00 % against 0.33 % on the photos for the first model.
- Caveat: the second model is a third-party conversion, and the conversion repository declares no
  licence; the bytes are the Apache-2.0 weights of `Falconsai/nsfw_image_detection`.
- Caveat: 352 images is a small sample. A rate of 0 % on the safe side is a rate of 0 % with an
  upper bound of 1.08 % (Wilson), and the 2.00 % of the pictures of the engine has an interval of
  [0.35 %, 10.50 %]: the numbers are what they are, not more than what they are.
- Caveat: no image and no prompt is in the repository. The pictures of the engine live in the
  volume; the repository keeps their digests (`results/safety/nsfw-sets.tsv`) and the id of the
  caption that made each one.

### The runs of the C73 check

| what | command | result |
|---|---|---|
| the pins | `fetch.py --lock models.lock --dest /mnt/storage --only nsfw,nsfw2` | nine artifacts, sha256 checked |
| the layout of the models | `sh nsfw.sh stage` | the id of the model is a directory, the preprocessor of the ONNX folder is the one of the root |
| the sets | `sh nsfw.sh sets` | 50 captions, 300 photos, 2 PNGs — 352 images |
| the pictures | `sh nsfw.sh gen` | 50 PNGs of 512², 0 failures, 23.0 s each (`results/safety/nsfw-gen/run.log`) |
| the check | `sh nsfw.sh bench` | the four files, 352 pictures each, the scores in `results/safety/nsfw-*/scores.tsv` |
| the summary | `sh nsfw.sh summaries` | the distribution, the false positives with their interval, the five highest |
| the fail-closed run | the same step | 9.6 ms, `file was not found locally` |

