# M7 — Image tagging: what the VLM tags, how well, and what proves it

The M7 slice of the AI plan: on request, a local vision-language model reads one
uploaded picture and returns a caption (the alt text), tags the user can edit,
the objects, and the text written in it. The result is saved in the block and
indexed, so the assistant can find the image by what it shows. Nothing leaves
the machine and nothing costs money per image.

Everything here is bound to the vision conditions **C79–C82** and the
conditions that the code of osionos #95 and #97 cites, **C80, C81, C92, C94 and
C97**, of the images and moderation devil verdict (conditions C79–C82, C80,
C81, C92, C94 and C97), kept with the project's review records outside this
repository. Each is summarised in one line below; the verdict text is not
copied here. The out-of-scope of this slice is written at the bottom.

**Status: ai-dev only. The public stack has no VLM.** The public overlay of
groot puts `osionos-ai-vlm` in the profile `ai-vlm`, which the public stack
never passes, and sets `OSIONOS_AI_VLM_URL` to the empty string
(`docker-compose.public.yml:183-184` and `:125` on groot develop). With the URL
unset the route answers what an unknown route answers
(`services/osionos-ai/tests/mediaDescribeOff.test.ts`), and the client hides
the action for the session after the first 404 (PR #97 body). The PRs #95 and
#97 were OPEN when this sheet was written (`gh pr view 95|97 -R Univers42/osionos`);
the sheet is stacked on #97, which is stacked on #95.

---

## What an evaluator does in three minutes

Needs the groot worktree with `--profile ai --profile ai-vlm`, and the VLM files
in the volume `osionos_ai_a1_data` (`fetch.py --only vlm` of the A1 spike, six
artifacts, sha256 checked, `RESULTS.md:137`). The compose gives the service
`OSIONOS_AI_VLM_URL: http://osionos-ai-vlm:8080` (`docker-compose.yml:417`). A
CPU describe takes about 12 s (see "The numbers"), so wait for it.

**1. Add an image.** On a page, upload a picture (png, jpeg or webp). The action
exists only for uploaded media, that is, an image whose `content` is a
`/api/media/uploads/...` path (`tests/canvas/ai-image-describe.test.ts`, "the
action shows only for capability paths").

**2. Describe it.** Hover the image: the toolbar button "Describe with AI"
(`ImageHoverToolbar.tsx:128`), or the same entry in the block's More menu
(`imageBlockMenu.tsx:115`, "Describing…" while it runs).

**3. Read and edit.** The caption becomes the alt text when the block has none;
if the block already has one, the caption is only offered, with "Replace alt
text" and "Keep mine". The tags appear as chips under the image: remove one with
its button (`aria-label="Remove tag <t>"`), add one with the "Add tag" input
(Enter). The text found in the image is behind a `<details>` disclosure. A
published page shows the chips without controls. One `updateBlock` call writes
`mediaAlt`, `mediaTags` (at most 10, user tags first) and `mediaText`.

**4. Find it by a word of its caption.** The page indexer writes `Image: <alt>`,
`Tags: a, b` and `Text in image: <text>` into the page text, and never the
capability path (`services/osionos-ai/src/indexer/sections.ts:62-73`). The
assistant's retrieval finds the page by those words after the page is
re-indexed. This is proved at the chunk level only, see "What is not done".

The cache: the second describe of the same bytes is a hit (one VLM call in
total); the key is the sha256 of the stripped bytes plus model plus
revision (`mediaDescribe.test.ts`, "the second request for the same bytes is a
cache hit: one VLM call in total").

---

## The commands (the gates)

```sh
# The service (throwaway Postgres + Redis, the AI migrations incl. ai_media_annotations, the suite).
# mediaDescribe.test.ts (13 tests), mediaDescribeOff.test.ts (1) and
# mediaDescribeRate.test.ts (1) are in it, with chunker.test.ts.
sh services/osionos-ai/scripts/test.sh <the AI migrations> <osionos-ai-media-migration.sql>

# The layout of the service.
docker run --rm -v "$PWD":/app -w /app node:22-bookworm-slim \
  services/osionos-ai/node_modules/.bin/tsc --noEmit -p services/osionos-ai/tsconfig.json

# The client.
bash scripts/docker-run.sh test-canvas
bash scripts/docker-run.sh typecheck
bash scripts/docker-run.sh lint
```

The totals the PR bodies report, not re-run for this sheet: #95, service suite
395 tests, 395 pass, 0 fail, 0 skipped; #97, canvas 3411 tests, 3411 pass, 0
fail (11 new in `ai-image-describe.test.ts`), service `ai` 396 pass, 0 fail.
Revert proofs in the bodies: replacing `stripMetadata(...)` with the raw bytes
fails the suite 394/395; letting the merge overwrite an existing alt fails
"merge: existing alt is kept and the caption is only suggested".

---

## What proves what

| Condition | What it says (one line) | Where it is proved |
|---|---|---|
| **C80** | Bytes come by media path through the bridge with the caller's token; never a URL | `services/osionos-ai/tests/mediaDescribe.test.ts` ("sends the schema, temperature 0, max_tokens 640 and the stripped bytes as a data URL; no capability path", "a 403 of the bridge is a 404 attachment_not_found", "no session is a 401, and a path that is not a media path is a 400") |
| **C81** | Bytes hygiene: sniffed rasters, pixel cap before the VLM, metadata stripped | `mediaDescribe.test.ts` ("refuses a GIF, an SVG and a text file before any VLM call", "refuses a picture over the pixel cap before the VLM", "accepts a webp", and the stripped-bytes test above). The 60 000-pixel header case and the RSS bound of the verdict are not run here |
| **C92** | The safety hint is stored and never returned | `mediaDescribe.test.ts` ("returns caption, tags, objects and ocr, normalised, and no safety", "stores the safety hint and the result under (sha256 of the stripped bytes, model, revision)") |
| **C94** | Only on request, only the caller's image, no background scan | No test. The code header says it (`services/osionos-ai/src/media/describe.ts:14`), and the PR #95 body: no `ai_jobs` row, no trigger |
| **C97** | The VLM safety flag is a hint, never a removal | Stored only (the C92 tests). No code reads the hint for a hold: the console side of C97 is not wired, see "What is not done" |
| (off) | Route and VLM off by default and on public | `services/osionos-ai/tests/mediaDescribeOff.test.ts` ("answers exactly what an unknown route answers, and fetches nothing") |
| (cost) | One VLM call in flight per replica; a per-user rate limit | `mediaDescribe.test.ts` ("two parallel describes never put two calls in flight on the VLM", "a request that waits longer than the queue allows is a 429 with Retry-After"); `mediaDescribeRate.test.ts` ("refuses past the window with Retry-After, before fetching the bytes") |
| (answer) | A bad VLM answer is never cached | `mediaDescribe.test.ts` ("a VLM answer that is not JSON is a 502 vlm_bad_answer and nothing is cached", "a JSON answer that misses the schema is a 502 too", "a VLM that does not answer in time is a 503 vlm_unavailable with Retry-After") |
| (client) | The merge into the block: alt kept, tags capped, errors worded | `tests/canvas/ai-image-describe.test.ts` ("merge: no alt yet -> caption becomes the alt text, one update", "merge: existing alt is kept and the caption is only suggested", "merge: user tags stay first, new appended, capped at 10", "merge: empty ocr leaves mediaText unset", "addTag / removeTag normalise and cap", "error codes map to user-facing messages, with Retry-After", "feature off: only 404 not_found, remembered, hides the action", "normaliseImageDescription caps tags (10), tag length (40) and text (300)") |
| (save) | The tags and the text survive export and import | `tests/canvas/page-file-overlay.test.ts` ("EXTRA_BLOCK_KEYS is the frozen 31-key allowlist"); `tests/canvas/page-file-codec-fixtures.ts` holds the `mediaTags` and `mediaText` probes the codec test round-trips |
| (index) | The caption, tags and text are in the page text | `services/osionos-ai/tests/chunker.test.ts` ("indexes the alt text of an image block as `Image: <alt>`, and never its URL", "indexes the tags and the text found in an image, so a search finds it by either") |
| **C79, C82** | Chat vision: explicit attach; third-party privacy | Not this route. The describe route sends bytes to our own VLM only, so nothing goes to a third party. The chat attach is the vision slice (`src/vision`) |

---

## The numbers

The pick, from the spike (osionos #91, MERGED): `services/osionos-ai/spikes/a1/results/vlm/RESULTS.md`
on develop, summaries `summary-qwen25vl-cpu.json` and `summary-smolvlm2-cpu.json`.
Both runs on the CPU, the same 300 pictures of COCO val 2017, the same prompt
and the same schema (RESULTS.md:67-82).

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

The shipped model is the right-hand column. In `summary-qwen25vl-cpu.json`:
`latency_s` p50 12.188799999999999, p95 20.6079, min 5.4723, max 42.1427, mean
13.144049163879599 seconds per image (lines 29-35); `valid_json` 300 of 300;
`recall` macro 0.6493001702867923; `precision_at_5` macro 0.29632107023411375.
Precision@5 has a ceiling near 0.6, because a picture carries 2.98 COCO
categories on average (RESULTS.md:84-85); recall is the number to read.

Hardware line: i5-13600KF, `llama-server -t 6`, `--cpus 6`, 7 GB of memory, a
host shared with other agents (RESULTS.md:3-7). gemma-3-4b was not measured
(RESULTS.md:86-88).

---

## The pinned things

| what | value |
|---|---|
| model | Qwen2.5-VL-3B-Instruct Q4_K_M GGUF, `ggml-org/Qwen2.5-VL-3B-Instruct-GGUF@5037fcf163dd95d1e41d1974465f0898ed108ca2`, sha256 `d02fe9b69ad8cadbbd228e387667af66612c44bed29ffc8eb1e7caf9ac486c12`, 1 929 901 056 bytes (Apache-2.0; `services/osionos-ai/spikes/a1/models.lock:35`) |
| projector | `mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf`, same revision, sha256 `980c9b2f78c04e6cff93d277ada09e768394f112d75db3b4e9dea8a69f9fb904` (`models.lock:36`) |
| engine | llama.cpp `server-b11580`; image `ghcr.io/ggml-org/llama.cpp@sha256:ba384e66b3f3b6474dc0285ed44466b6f025c7106865d915f1fe5ae2a2da7411` (groot `docker-compose.yml:913`, PR #117, MERGED 2026-10-22T22:57:13Z) |
| flags | `--jinja -c 4096 -np 1 -t 6`, alias `qwen2.5-vl-3b-instruct-q4_k_m`; `mem_limit: 6g`, `cpus: 6`; the volume is read-only |
| answer | the JSON schema `{caption ≤ 200, tags ≤ 10, objects ≤ 10, ocr ≤ 300, safety}`, temperature 0, 640-token budget |
| service settings | timeout 90 s, queue wait 30 s, 6 describes a minute per user (`services/osionos-ai/src/config.ts:118-125`) |
| not pinned for this model | SmolVLM2 and gemma rows are also in `models.lock:33-38`; they are not shipped |

---

## What is not done

- **Browser check.** The toolbar button, the menu entry, the chips and the
  disclosure were not exercised in a browser (PR #97 body). One real-model
  smoke exists, without the bridge: the groot #117 service definition on one
  COCO picture answered schema-valid JSON in 16.96 s at 4.38 GiB under the
  6 GiB limit (PR #95 comment, 2026-10-23). It is a smoke, not a benchmark.
- **Search in the app.** Step 4 is the assistant's retrieval index, proved on
  chunks. No test or run shows a page search box finding the image by a caption
  word.
- **Background tagging.** The spike recommended tagging every upload in the
  background through `ai_jobs` (`RESULTS.md:105-110`). The shipped route is on
  request only, with no job (C94). Tagging at upload is not built.
- **The hold on a flagged image (C97).** The safety hint is stored. This sheet
  found no code that holds a public image for review or blurs it in the console.
- **The 60 000-pixel header case and RSS bound of C81.** The pixel cap is
  tested, the memory bound is not.
- **The production working set.** The spike measured against a 7 GiB cap
  (`RESULTS.md:101-103`); the one smoke under the 6 GiB compose limit used
  4.38 GiB on one picture. A sustained run under 6 GiB is not measured.
- **A 20-per-hour bucket.** The rate limit is per minute (PR #95 body).
- **Totals re-run.** The pass counts above are the PR bodies', not mine.
- **Course lessons `04/18` and `04/25`.** The plan text is not in this
  repository, so this sheet cites the numbers and does not restate them.

---

## Caveats

- **Caveat: the tag recall is measured on COCO val mapped to our vocabulary, not
  on osionos images.** Three hundred photographs say little about screenshots,
  drawings or scans, and a hand table of 187 spellings maps the tags to the 80
  COCO categories: a tag the table does not know is a miss, so the numbers are
  the table's as much as the model's (`RESULTS.md:118-124`; 1199 of 1750
  predicted tags were unmapped, `summary-qwen25vl-cpu.json:52-53`).
- **Caveat: the seconds per image are CPU seconds on a shared host.** One
  machine, one day, a load average of 1.8–6.5 for the Qwen run against
  13–32 for the header of the spike. A quiet host is faster, a loaded one
  slower: the max was 42.1 s.
- **Caveat: the vision attach is untestable on ai-dev.** The ai-dev stack has no
  media storage, so the bridge cannot serve an uploaded picture to the service.
  What was tested instead: the service against a mock bridge that serves bytes
  at a media path and a mock llama-server (`mediaDescribe.test.ts`, header;
  `mockVlm.ts`), plus the client merge as pure functions. No real picture
  reached the real VLM through the real bridge.
- **Caveat: the safety recall is not measured.** No unsafe picture was ever
  used, so the 0.7 % is a false-flag rate on benign pictures. The hint is not a
  detector and not CSAM detection (C97).
- **Caveat: public status.** There is no VLM on the public stack, by profile and
  by an empty URL. The route answers 404 there, and the action hides itself.
- **Caveat: OCR is read by a human in the spike, not scored.** Qwen wrote an
  OCR string for 33 of 299 pictures while about 20 hold text; its accuracy on
  those is not a number.
