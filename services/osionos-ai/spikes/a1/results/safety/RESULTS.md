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
