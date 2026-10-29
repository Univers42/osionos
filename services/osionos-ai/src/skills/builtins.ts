/**
 * The built-in skills: procedures an agent loads when the task needs them.
 *
 * A skill is `{ id, version, name, description, body }`. The prompt of an
 * agent carries only the id and the one-line description of each skill (the
 * index); the body reaches the model through the `load_skill` tool, as a tool
 * result, when the task matches. A body in the prompt would be paid on every
 * step of every run; a body loaded on demand is paid once, by the runs that
 * need it (progressive disclosure).
 *
 * The list is frozen and lives in the code, like the built-in agents. The
 * version is pinned on the tool result event of the run (devil C40).
 */

/** A skill, as the configuration of the runtime. */
export interface BuiltinSkill {
	/** Kebab-case id: what the index and `load_skill` call it by. */
	id: string;
	/** The version of the body, pinned on the event of the load (devil C40). */
	version: number;
	/** The name the reader sees. */
	name: string;
	/** One line: when to load it. It sits in the prompt of every run of the agent. */
	description: string;
	/** The procedure, in markdown. */
	body: string;
}

/** The most characters a body may take: it lands in the context once, as a tool result. */
export const SKILL_BODY_MAX = 6000;

/**
 * The most characters the index of one agent's skills may take in the prompt.
 *
 * The index is in the cached prefix, so every step of every run pays for it
 * (devil C47). 800 characters is about five skills with a one-line description.
 */
export const SKILL_INDEX_MAX = 800;

const SCHEMA_DESIGN = `# Schema design

Follow in order. Skip a step only when the user already gave its answer.

1. Access pattern first. List the queries: what each filters on, joins on, sorts on, how often it runs, how many rows it touches. No list, no design: ask.
2. Entities. One table per thing with its own identity and lifecycle. A noun that only describes another (a status, a unit) is a column, or a lookup table if its values carry data or change without a deploy.
3. Keys.
   - Surrogate primary key (bigint identity or uuid) per table.
   - UNIQUE on the business identity (email, slug, (tenant_id, external_id)).
   - Foreign key for every reference, with the ON DELETE rule stated: RESTRICT by default, CASCADE only for parts that cannot outlive the owner.
   - Many-to-many: a join table whose primary key is the pair.
4. Normal forms.
   - 1NF: one value per column. No comma lists, no repeating columns (tag1, tag2). Use a child table; use jsonb only for data you never filter or join on.
   - 2NF: with a composite key, every column depends on the whole key.
   - 3NF: no column depends on another non-key column (zip -> city). Move it out.
   - BCNF: every determinant is a candidate key. Check it when a table has two overlapping candidate keys.
   - Name the form a table breaks and what the break buys.
5. Denormalise only on evidence: a measured slow query that an index cannot fix. Then keep one source of truth and derive the copy (trigger, generated column, materialised view), and write down who keeps it in sync. Cheap, safe cases: a counter on a hot read, a snapshot of a price on an order line (history, not duplication).
6. Constraints over application checks. NOT NULL by default; CHECK for ranges and enums (status in (...)); UNIQUE and EXCLUDE for overlaps; DEFAULT for domain defaults. The database is the only place that cannot be bypassed by a second writer.
7. Indexes, only for the stated queries.
   - Every foreign key gets an index (deletes and joins scan it).
   - Composite index order: equality columns first, then the range or sort column.
   - Partial index for a hot subset (where deleted_at is null). Covering index (INCLUDE) when a query is index-only.
   - Say which query each index serves. An index no query uses is write cost for nothing.
8. Naming. snake_case; plural table names (orders); singular columns; <table>_id for foreign keys; created_at / updated_at as timestamptz; booleans read as assertions (is_active); no reserved words; same word for the same concept everywhere.
9. Types. timestamptz for moments, numeric (not float) for money, text over varchar(n) unless the limit is a business rule, uuid or bigint for ids, enums as CHECK or lookup table.

## Answer shape

Tables with columns, types, nullability, keys. Then the DDL. Then the indexes, each with its query. Then the trade-offs you chose.

## Review checklist

- [ ] Every query of the access pattern has a stated index or a reason it needs none.
- [ ] Every table has a primary key and a UNIQUE business key where one exists.
- [ ] Every reference is a foreign key with an explicit ON DELETE.
- [ ] No multi-valued column; no column derived from a non-key column.
- [ ] Money is numeric, moments are timestamptz.
- [ ] Rules that must always hold are constraints, not application code.
- [ ] Every denormalisation names its source of truth and its sync mechanism.
- [ ] Names are consistent and carry no abbreviation a reader must decode.`;

const ACID_REVIEW = `# ACID review of a write path

Trace one request from entry to commit. For each property, quote the code or statement that provides it, or report the gap.

## Atomicity
- Every write that must succeed or fail together is in ONE transaction on ONE connection. List the writes; mark any outside the transaction (a second connection, a queue publish, an HTTP call, a file).
- A side effect that cannot roll back (email, webhook, payment call) goes after the commit, or through an outbox row written inside the transaction and sent by a worker.
- On error the transaction is rolled back and the connection released. No swallowed exception between BEGIN and COMMIT.

## Consistency
- The invariants (balance >= 0, one active subscription per user) are constraints or checked inside the transaction under a lock, not read-then-write outside it.

## Isolation
Name the level in use, then the anomalies it allows.
- Read committed (Postgres default): allows non-repeatable reads, phantoms, lost updates on read-modify-write.
- Repeatable read (snapshot): stops those; allows write skew (two transactions read overlapping rows, each writes a different one, the invariant breaks). Writers conflicting on the same row get a serialization error and must retry.
- Serializable: stops write skew; any transaction may fail with a serialization error, so the caller must retry the whole transaction.
Fixes for a read-modify-write: a single UPDATE with the arithmetic in SQL (set n = n - 1 where n > 0), SELECT ... FOR UPDATE, an optimistic version column, or a higher isolation level plus retry. Prefer the single statement.

## Idempotency
- A retried request (client timeout, queue redelivery) must not apply twice. Require an idempotency key from the caller; store it with a UNIQUE constraint in the same transaction as the effect; on conflict return the stored result.
- Retries on serialization failure or deadlock: bounded count, backoff with jitter, whole transaction re-run.

## Locks
- Take row locks in one global order (by primary key ascending) so two transactions cannot wait on each other. Report any path that locks A then B next to one that locks B then A.
- Keep transactions short: no network call, no user wait, no large scan while holding locks. Set lock_timeout and statement_timeout.
- Use SKIP LOCKED for work queues, NOWAIT when the caller prefers failing fast.

## Durability
- Commit means flushed: synchronous_commit stays on for money and identity data. State where it is relaxed and what loss window that accepts.

## What to measure
- Transaction duration p95 and lock wait time; serialization failures and deadlocks per minute (pg_stat_database: xact_rollback, deadlocks); retry count per request; rows touched per transaction. Cite the query or metric for each number; do not guess.

## Answer shape
Per property: OK / GAP, the evidence (file:line or statement), the minimal fix. End with the single highest-risk gap first.`;

const CONCISE_DOCS = `# Concise documentation

Write for a person who is trying to do one thing right now.

1. Lead with the reader's action. The first sentence under a heading says what to do, in the imperative. Background comes after, only if the reader needs it to succeed.
2. Heading = task. "Connect your calendar", not "Calendar connections".
3. Order of a procedure: prerequisites, numbered steps (one action each), the expected result, what to do when it fails.
4. One idea per sentence. Over 25 words: split it. Active voice, present tense, second person ("you").
5. Examples are copied from real output: run the command, paste the output, trim only with an ellipsis you mark. Never compose a plausible output. If you cannot run it, say the example is unverified.
6. Say what it does NOT do: limits, unsupported cases, irreversible effects, permissions needed. A page with only the happy path is marketing.
7. Exact names: the button, field, flag and setting as the interface writes them, in code formatting for literals.
8. One source of truth: link to the page that owns a fact instead of restating it.
9. Never invent a fact. If the source does not say, write what is missing and who can answer.

## Banned words
simply, just, easily, obviously, of course, powerful, seamless, robust, blazing, leverage, utilize, in order to, it is important to note that, please note, basically, actually.

## Cut list
- A sentence that restates its heading.
- Intro paragraphs that announce what the page will say.
- Adjectives that claim quality ("fast", "simple") with no number.
- Sign-offs ("Hope this helps").

## Before you hand it over
- [ ] A reader can do the task using only the steps, in order.
- [ ] Every example was run or is marked unverified.
- [ ] Limits and failure cases are stated.
- [ ] No banned word remains.`;

const DATA_SUMMARY = `# Data summary

Summarise a database or table for a reader who has not seen it. Every number comes from a read you did; none is estimated unless labelled.

1. Scope. State what you read: workspace, table, columns, row count, the date you read it. If you read a sample, say how many rows and how they were chosen.
2. Shape. Row count, the columns that matter and their types, the key, and what one row represents ("one row = one order line").
3. Counts. Totals and the split by the categorical columns that explain the data (status, owner, type). Give count and share: "412 rows, 38% open".
4. Distributions. For numeric and date columns: min, median, max, and the spread (p10 / p90 or the range). Median before mean when values are skewed.
5. Trend over time. Group by a consistent period (day, week, month) on one date column, name that column, and compare like with like (same length of period, same definition). Say whether the last period is complete.
6. Outliers. The few rows far from the rest: show the value, the row id, and one plausible reading; do not delete or explain away.
7. Missing data. Per column: how many empty, and whether the emptiness looks random or systematic (all rows before a date, one owner). Say what the summary cannot tell because of it.
8. Never invent. No number you did not read, no trend from two points, no causes stated as facts. If the data to answer is absent, say so and say what would be needed.

## Answer shape
- One-sentence headline with the main figure and its source.
- A compact table of counts or the trend.
- Bullets: outliers, then caveats.
- Last line: what this data cannot answer.

## Check before sending
- [ ] Each figure names its table, column and date.
- [ ] Percentages add up; periods are comparable.
- [ ] Caveats about missing or sampled data are present.`;

/** The built-in skills, in the order the prompt indexes them. */
export const BUILTIN_SKILLS: readonly BuiltinSkill[] = Object.freeze([
	Object.freeze({
		id: 'schema-design',
		version: 1,
		name: 'Schema design',
		description: 'Design a relational schema: entities, keys, normal forms, constraints, indexes, naming.',
		body: SCHEMA_DESIGN,
	}),
	Object.freeze({
		id: 'acid-review',
		version: 1,
		name: 'ACID review',
		description: 'Review a write path for atomicity, isolation anomalies, idempotency and lock ordering.',
		body: ACID_REVIEW,
	}),
	Object.freeze({
		id: 'concise-docs',
		version: 1,
		name: 'Concise docs',
		description: 'Write documentation a reader can act on: task first, short sentences, real examples.',
		body: CONCISE_DOCS,
	}),
	Object.freeze({
		id: 'data-summary',
		version: 1,
		name: 'Data summary',
		description: 'Summarise a table: counts, distributions, trends, outliers, missing data, no invented numbers.',
		body: DATA_SUMMARY,
	}),
]);

/** The ids of the built-in skills. */
export const BUILTIN_SKILL_IDS: readonly string[] = Object.freeze(BUILTIN_SKILLS.map((skill) => skill.id));

/** The skill of that id, or null when there is none. */
export function findBuiltinSkill(id: string): BuiltinSkill | null {
	return BUILTIN_SKILLS.find((skill) => skill.id === id) ?? null;
}
