# The enrichment queue — `ai_jobs`

The queue of the AI plane: moderation (M4 L1), sentiment (M6) and image tags
(M7) run in the background, on local encoders, while the writer reads the page.

One row per (kind, subject): a subject edited ten times while its job waits is
classified once. `ai_index_queue` is NOT reused — it is keyed by page and
debounced for typing, and these subjects are comments, rows and media.

The table and its function are the migration's
(`models/osionos-ai-jobs-migration.sql`); this slice is the library that
drains it: `services/osionos-ai/src/jobs/`. No handler, no entrypoint yet.

## The lease

The worker LEASES, it does not lock. The claim is ONE statement: it takes the
rows that are due (`run_after <= now()`, `attempts < maxAttempts`), the lane
of a person first (a lower priority first; the default is 5), with `FOR UPDATE SKIP
LOCKED` — two replicas never take the same row — and it pushes `run_after`
out by the lease (300 s) in the same statement. A worker that dies mid-job
does not hold it for ever: the lease ends and the row is due again.

## The `enqueued_at` rule

`ai_enqueue_job` writes `enqueued_at = clock_timestamp()` on every enqueue,
and the delete of a finished job carries it (`enqueued_at = $4`). A subject
edited while its job ran carries another `enqueued_at`, so the delete touches
nothing and the new content is classified again: a job is only deleted when it
is still the job that was claimed.

## The backoff

A failure is one more attempt, the reason (the class and the message of the
error, cut at 500 characters — never the content of the subject) and the next
try: `run_after = now() + least(2 ^ (attempts + 1), 600)` seconds — 2, 4, 8…
up to ten minutes. A job that failed eight times is left alone.

## How a handler slice plugs in

```ts
const worker = new JobWorker({
  pool,
  kind: 'moderate',                             // one worker per kind
  handle: async (job, signal) => { /* ... */ }, // the ids, and the signal
});
await worker.start();   // at the end of the process: await worker.stop();
```

The worker wakes on the NOTIFY of the channel `ai_jobs` (the payload is the
kind; the notifications of the other kinds are ignored) and polls every 5 s
for the notification that was lost. The concurrency is the indexer's AIMD
controller, fed with the latency of the handlers: a fast handler buys one more
job in flight, a slow one halves the number.

## The caveat of the migration

A re-enqueue during a run makes the row claimable at once, so a second replica
can process the newer version while the first still holds the older one: the
two results race. A handler must write its result keyed by the content hash it
classified, so the stale one is recognisable.
