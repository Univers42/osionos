# P7a — load test of osionos-ai (10k-user profile, mock upstream)

## Command

```
sh services/osionos-ai/load/stack.sh up
# seed 500 users
docker run --rm --network ai-load-net ... node --experimental-strip-types load/seed.ts
# stats sampler
sh services/osionos-ai/load/stats.sh /home/dlesieur/wt-ai-night/tmp/load-stats.jsonl &
# generator
docker run -d --name ai-load-gen --network ai-load-net --cpus 2 --memory 2g ... node --experimental-strip-types load/run-load.ts
sh services/osionos-ai/load/stack.sh down
```

Commit sha: 0063ea1368abe7182c57780daf3c001230352cbc

## Container limits

- ai-load-service: `--cpus 2 --memory 1g`
- ai-load-mock: `--cpus 1 --memory 512m`
- ai-load-pg: `--cpus 1 --memory 1g`
- ai-load-redis: `--cpus 0.5 --memory 512m`
- ai-load-gen: `--cpus 2 --memory 2g`

## Profile (open-model arrivals, 3.5 runs/s, 10 min)

| n | error rate | overhead p50 | overhead p95 [95% CI] | overhead p99 | stream dur p50 | stream dur p95 |
|---|---|---|---|---|---|---|
| 2119 | 1.65% (run_in_progress 35) | 9.1 ms | 14.7 ms [14.2, 15.3] | 41.6 ms | 20121.1 ms | 20129.9 ms |

## Steps (constant concurrency, 3 min each)

| concurrency | n | error rate | overhead p50 | overhead p95 [95% CI] | overhead p99 | stream dur p50 | stream dur p95 |
|---|---|---|---|---|---|---|---|
| 35 | 315 | 0.00% | 49.5 ms | 76.4 ms [75.3, 81.7] | 82.0 ms | 20192.7 ms | 20206.9 ms |
| 70 | 634 | 0.63% (run_in_progress 4) | 78.0 ms | 115.0 ms [111.2, 127.2] | 134.6 ms | 20226.7 ms | 20291.2 ms |
| 140 | 1297 | 2.85% (run_in_progress 37) | 61.9 ms | 252.8 ms [233.9, 261.2] | 285.4 ms | 20192.5 ms | 20435.9 ms |
| 280 | 2672 | 5.69% (run_in_progress 152) | 87.4 ms | 525.9 ms [509.0, 555.6] | 627.3 ms | 20206.8 ms | 20787.0 ms |

## Knee

First step whose overhead p95 > 150 ms or error rate > 1%: **140 concurrent** (overhead p95 252.8 ms, error rate 2.85%).

## Verdict against the plan's budget

overhead p95 at 70 concurrent = 115.0 ms [111.2, 127.2], budget 150 ms: holds

## Service resource peaks (docker stats --no-stream every 2 s)

- CPU peak: 106.7%
- RSS peak: 250.9 MiB

## Host loadavg

- start: 3.17, 2.93, 3.13
- end: 3.96, 3.92, 3.53

## Caveat

- Shared host at load ≈ 9–12 (numbers are pessimistic).
- Mock upstream (no real provider latency or backpressure).
- No retrieval (the embedder and the hybrid SQL add their own ~40–60 ms p50, eval/wiki/RESULTS-rag.md).
- One replica; Redis and Postgres on the same host.