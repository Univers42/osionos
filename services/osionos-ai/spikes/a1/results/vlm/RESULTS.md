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

TABLE_PLACEHOLDER

## Findings

FINDINGS_PLACEHOLDER

## Recommendation

RECOMMENDATION_PLACEHOLDER

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

RUNS_PLACEHOLDER
