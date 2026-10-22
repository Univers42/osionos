# The spike of the indexer

The measurement of the indexer: the backfill of the eval corpus, ten times
over, with the query load of a user on the same embedding service.

- `RESULTS.md` — the report: the numbers, the commands, the caveat.
- `harness.sh` — the throwaway stack: a Postgres, a TEI with the real model,
  the seed, the migrations and the run. The containers are named `ai-idx-*`.
  It can run TWO embedders — the query one and the bulk one, the same image,
  the same model, the same volume (read-only for the bulk one).
- `seed-ten.mjs` — the corpus of the golden set, ten times over, in ten
  workspaces. The pages are seeded before the RAG migration, so the backfill
  of the migration is what queues them (as bulk work, lane 1).
- `measure.mjs` — the run: the query load (one query every 100 ms, sixteen in
  flight) alone, then the same load while the corpus is indexed. The queries
  go to the query embedder, the indexer to the bulk one.
- `runs.jsonl`, `splits.jsonl` — the raw runs of the report, one JSON line
  per run.

```sh
# the indexer of the branch, one shared embedder
sh services/osionos-ai/spikes/indexer/harness.sh after \
	/path/to/groot/models/osionos-ai-rag-migration.sql

# two embedders: the CPU of the query one and of the bulk one
AI_IDX_BULK=1 AI_IDX_QUERY_CPUS=3 AI_IDX_BULK_CPUS=5 \
	sh services/osionos-ai/spikes/indexer/harness.sh after-isolated \
	/path/to/groot/models/osionos-ai-rag-migration.sql

# the indexer of another branch: give the module of its worker
sh services/osionos-ai/spikes/indexer/harness.sh before \
	/path/to/rag-before.sql "../../spikes/indexer/tmp-before/worker.ts"
```

The knobs of the indexer are read from the environment: `OSIONOS_AI_EMBED_TARGET_MS`,
`OSIONOS_AI_EMBED_MAX_CONCURRENCY`, `OSIONOS_AI_EMBED_MAX_INPUTS` and
`OSIONOS_AI_EMBED_TOKEN_BUDGET`.

Caveat: the host is shared, and the load average of the other agents is in
every number of the report. The runs of the report are interleaved for that
reason.
