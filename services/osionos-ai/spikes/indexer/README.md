# The spike of the indexer

The measurement of the indexer: the backfill of the eval corpus, ten times
over, with the query load of a user on the same embedding service.

- `RESULTS.md` — the report: the numbers, the commands, the caveat.
- `harness.sh` — the throwaway stack: a Postgres, a TEI with the real model,
  the seed, the migrations and the run. The containers are named `ai-idx-*`.
- `seed-ten.mjs` — the corpus of the golden set, ten times over, in ten
  workspaces. The pages are seeded before the RAG migration, so the backfill
  of the migration is what queues them (as bulk work, lane 1).
- `measure.mjs` — the run: the query load (one query every 100 ms, sixteen in
  flight) alone, then the same load while the corpus is indexed.

```sh
# the indexer of the branch
sh services/osionos-ai/spikes/indexer/harness.sh after \
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
