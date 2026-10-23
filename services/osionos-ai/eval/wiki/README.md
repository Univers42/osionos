# Simple English Wikipedia — the large corpus of the RAG eval (M2)

Imports Simple English Wikipedia as pages of one shared workspace, "Wikipedia (Simple English)", so the real
indexer cuts and embeds them like any page. Every pin (source URL, checksum, images, wheels, model) is in
`wiki.lock`; nothing is fetched or run that is not written there. The bytes live in the Docker volume
`osionos_ai_wiki_data`, never in the repository.

## Run it

From the repository root of osionos. `$NODE_IMAGE` and `$PYTHON_IMAGE` are the digests of `wiki.lock`.

1. **Fetch** the pinned parquet, checksum verified (`--source dump` for the wikimedia dump when the mirror answers 429).

   ```sh
   sh services/osionos-ai/eval/wiki/fetch.sh
   ```

2. **Extract** to `/data/articles.jsonl` in the volume (one JSON object per article: title, url, revision, sections):

   ```sh
   docker run --rm -v osionos_ai_wiki_data:/data -v "$PWD/services/osionos-ai/eval/wiki:/wiki:ro" -w /wiki \
     "$PYTHON_IMAGE" sh -c 'pip install -q pyarrow==21.0.0 mwparserfromhell==0.7.2 && python extract.py'
   ```

3. **Import** into the eval stack's Postgres. The SQL goes to stdout and psql applies it, one transaction per batch
   of 500 pages; the queue rows of a batch move to the bulk lane (`priority = 1`) in the same transaction, so a
   person editing a page (lane 0) never waits behind the import. Page ids are uuid v5 of the title: a re-run
   rewrites the same rows. `--from "<title>"` resumes at that article (it is imported again).

   ```sh
   docker run --rm -v "$PWD:/app:ro" -v osionos_ai_wiki_data:/data:ro -w /app "$NODE_IMAGE" \
     node services/osionos-ai/eval/wiki/import.mjs --workspace-owner <owner uuid> --limit 17000 \
     | docker exec -i <eval db container> psql -v ON_ERROR_STOP=1 -U <user> -d <database>
   ```

   The pipe exits with psql's status (0 on an empty input): check the importer's `[import] N articles` line on stderr.

4. **Watch** `ai_index_queue` drain:

   ```sql
   select priority, count(*) from public.ai_index_queue group by priority;  -- no row when done
   select count(*) from public.ai_chunks;
   ```

`stack.sh` runs the tests and the measurement on a throwaway `ai-wiki-*` stack (Postgres with both AI
migrations, TEI, the real indexer):

```sh
M=<groot>/models
sh services/osionos-ai/eval/wiki/stack.sh test    $M/osionos-ai-migration.sql $M/osionos-ai-rag-migration.sql
sh services/osionos-ai/eval/wiki/stack.sh measure $M/osionos-ai-migration.sql $M/osionos-ai-rag-migration.sql
node --test services/osionos-ai/eval/wiki/   # the pure tests; the database tests SKIP without the stack
```

## Measured (2026-10-21, `feat/ai-wiki-import` at 2deee6ce, this host: i5-13600KF, TEI cpu-1.9.4 `--cpus 8`)

`stack.sh measure` on the first 500 accepted articles of the parquet:

```text
uptime-before:  23:02:56 up 1 day,  7:30,  1 user,  load average: 1.54, 1.83, 2.01
[import] 500 articles imported, 36 skipped, 536 read
[wiki] pages=500 queued=500 lane1=500 lane0=0
[wiki] the queue is empty after 128s
[wiki] pages=500 chunks=4273 seconds=128
uptime-after:  23:05:16 up 1 day,  7:32,  1 user,  load average: 8.38, 4.42, 2.94
```

| Number | Value | From |
|---|---|---|
| pages inserted | 500 (36 skipped of 536 read) | `stack.sh measure` |
| queue rows in lane 1 | 500 (lane 0: 0) | `stack.sh measure` |
| seconds until the queue is empty | 128 | `stack.sh measure` |
| chunks created | 4,273 | `stack.sh measure` |
| chunks / article (these 500) | 8.546 | 4,273 / 500 |
| chunks / s | 33.4 | 4,273 / 128, including the 10 s debounce (`src/indexer/worker.ts:76`) and the indexer's start |

The load rose to 8.38 during the run, mostly from the stack's own TEI and indexer; the share of other jobs is unknown.

## Choosing N

Those 500 come from the head of the file, and the head is not the length distribution of the whole set.
`estimate.mjs` runs the indexer's own chunker (`chunkPage`) on the pages the importer would write, without
embedding. On the same 500 it gives 4,273, the number the database counted.

```text
$ node estimate.mjs --limit 500     # the cross-check; in "$NODE_IMAGE", repo at /app, volume at /data
accepted=500 sampled=500 chunks=4273 chunks/article=8.546 …
$ node estimate.mjs --every 1       # every accepted article of the file
accepted=159977 sampled=159977 chunks=837057 chunks/article=5.232 … head-articles-for-110000=16932
$ node estimate.mjs --limit 17000
accepted=17000 sampled=17000 chunks=110362 chunks/article=6.492 …
```

**N = 17,000 articles → 110,362 chunks** (≥ the 110k target; ≥ 100k is the M2 bar). The head articles are long:
the 500-article rate of 8.546 chunks/article picks N = 12,872, which gives 87,662 chunks
(`estimate.mjs --limit 12872`). The whole file is 159,977 accepted articles (241,787 extracted) and 837,057 chunks.

Projected wall time at the measured 33.4 chunks/s: **≈ 55 min** for N = 17,000, ≈ 7 h for the whole file.

Caveat: the chunk counts are exact for this chunker and this extract. The wall time is the 500-page rate
extrapolated to 26× the chunks, on a CPU shared with other jobs (see the `uptime` lines); it ignores the larger
HNSW index late in the import, and it does not transfer to the eval VM, whose CPU is different.

## Attribution (CC BY-SA 4.0)

The text is Simple English Wikipedia under CC BY-SA 4.0. The last block of every imported page is its attribution
(`pages.mjs`, `attribution`):

```text
Source: Wikipedia, '<title>', https://simple.wikipedia.org/wiki/<title>, CC BY-SA 4.0
```

Anything that redistributes these pages (export, published page, dataset) keeps that attribution and CC BY-SA 4.0.

## What it does not do

- It does not follow Wikipedia: the parquet is the 2023-11-01 snapshot (`HF_CONFIG`), and the dump fallback is
  the 2026-10-01 one, so the two give different counts. The numbers above are from the parquet.
- No images: only section text, as headings and paragraphs (`pages.mjs`, `blocksOf`).
- Never against the live stack: only the eval stack or the throwaway `ai-wiki-*` stack.

## The golden set of the wiki (`golden-wiki.jsonl`)

200 questions: 160 answerable, 40 unanswerable. **LLM-drafted, 0 human-validated** (`validated_by` is null on every
line). Seed 42; the model and its GGUF sha256 are on each line (`drafted_by`).

- Answerable: one section of one imported page is quoted to the model, which writes a question and a short answer.
  `expected` is that page's id. A draft that contains the article title (361 dropped) or copies 7 consecutive
  words of the passage (4 dropped) is redrawn; 29 pages had no section of a usable length.
- Unanswerable: the question is drafted from an article of `articles.jsonl` that was not imported. `expected` is `[]`.
  Caveat: another imported article may still mention the subject, so "unanswerable" is approximate.
- Caveat: the draw is deterministic, the model is only near-deterministic (CPU, temperature 0): a re-run may word a
  question differently. Nothing checks that a question is good or that its `answer` is right.

```sh
node services/osionos-ai/eval/wiki/golden.mjs --pages pages.jsonl --articles /data/articles.jsonl \
  --llm-url http://<llama.cpp>:8080 --model-label "<model, quant, gguf sha256>"   # pages.jsonl: see the header of golden.mjs
node --test services/osionos-ai/eval/wiki/golden.test.mjs
```
