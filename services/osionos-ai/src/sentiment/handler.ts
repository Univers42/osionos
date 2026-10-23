/**
 * The handler of the 'sentiment' jobs: one page comment or one projected
 * object-database row of an opted-in workspace in, one row of ai_sentiment out.
 *
 * What it NEVER does: score any other subject kind (C139), score a workspace
 * that has not opted in (C138), let a score of old content land on new content
 * (C142), or write the text or the author anywhere (C140). Nothing in
 * src/moderation or src/recs imports this file (C144).
 *
 * Fail-loud on labels (C148): a model whose labels are not
 * negative/neutral/positive throws a shape error; the worker retries and the
 * log shows it.
 *
 * Caveat: the label names are matched by name, and LABEL_0/1/2 by the id2label
 * order of cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual
 * (0 negative, 1 neutral, 2 positive). Another model that hides its names in
 * a different order would be mislabelled, not rejected.
 */

import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { TeiError, teiPredict } from '../encoders/tei.ts';
import type { LabelScore } from '../encoders/tei.ts';
import type { Job } from '../jobs/queue.ts';

export interface SentimentHandlerOptions {
	pool: Pool;
	/** The TEI that serves the sentiment model. */
	teiUrl: string;
	model: string;
	revision: string | null;
	/** The bound on one classifier call, in milliseconds. */
	timeoutMs?: number;
	/** One entry per decision: ids and event only — never the text or the score. */
	log?: (entry: Record<string, unknown>) => void;
}

export type SentimentLabel = 'negative' | 'neutral' | 'positive';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASSIFIER_TIMEOUT_MS = 15_000;

const BY_NAME: Record<string, SentimentLabel> = {
	negative: 'negative',
	neutral: 'neutral',
	positive: 'positive',
	label_0: 'negative',
	label_1: 'neutral',
	label_2: 'positive',
};

// The C142 guard, once: the row's content hash is the hash that was scored.
const SHA_MATCHES = "encode(sha256(convert_to(c.content, 'UTF8')), 'hex') = $6";

// The comment as the handler may score it: its page is live and its workspace
// opted in (the trigger's own rule, re-checked now — C138).
const SUBJECT_FROM = `from public.osionos_page_comments c
	  join public.osionos_pages p on p.id = c.page_id
	  join public.ai_sentiment_settings s on s.workspace_id = p.workspace_id and s.enabled`;

const READ = `select c.content, p.workspace_id ${SUBJECT_FROM}
	 where c.id = $1::uuid and p.archived_at is null`;

const WRITE = `
insert into public.ai_sentiment (subject_kind, subject_id, workspace_id, label, confidence, model, revision, content_sha256)
select 'page_comment', c.id::text, p.workspace_id, $2, $3, $4, $5, $6
  ${SUBJECT_FROM}
 where c.id = $1::uuid and p.archived_at is null and ${SHA_MATCHES}
on conflict (subject_kind, subject_id) do update set
  label = excluded.label, confidence = excluded.confidence, model = excluded.model,
  revision = excluded.revision, content_sha256 = excluded.content_sha256, scored_at = now()`;

// A projected object-database row (M6p-1): the text is the projection's own
// chosen string, and the workspace must still be opted in (C138).
const READ_ROW = `select r.scored_text as content, r.workspace_id
  from public.osionos_object_database_rows r
  join public.ai_sentiment_settings s
    on s.workspace_id = r.workspace_id and s.enabled
 where r.id = $1::uuid and length(btrim(r.scored_text)) > 0`;

// C142 for a row: the write lands only when the live text still hashes to the
// sha the job carried, so an edit between enqueue and write scores nothing.
const WRITE_ROW = `
insert into public.ai_sentiment (subject_kind, subject_id, workspace_id, label, confidence, model, revision, content_sha256)
select 'database_row', r.id::text, r.workspace_id, $2, $3, $4, $5, $6
  from public.osionos_object_database_rows r
  join public.ai_sentiment_settings s
    on s.workspace_id = r.workspace_id and s.enabled
 where r.id = $1::uuid
   and encode(sha256(convert_to(r.scored_text, 'UTF8')), 'hex') = $6
on conflict (subject_kind, subject_id) do update set
  label = excluded.label, confidence = excluded.confidence,
  model = excluded.model, revision = excluded.revision,
  content_sha256 = excluded.content_sha256, scored_at = now()`;

const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The winning label of one prediction, with its score as the confidence. */
export function pickLabel(prediction: LabelScore[]): { label: SentimentLabel; confidence: number } {
	let best: { label: SentimentLabel; confidence: number } | null = null;
	for (const entry of prediction) {
		const label = BY_NAME[entry.label.toLowerCase()];
		if (!label) {
			throw new TeiError('shape', 'the sentiment model answered labels outside negative/neutral/positive');
		}
		if (!best || entry.score > best.confidence) best = { label, confidence: entry.score };
	}
	if (!best) throw new TeiError('shape', 'no prediction for the text');
	return best;
}

/** The handler of the 'sentiment' kind, for JobWorker. */
export function createSentimentHandler(options: SentimentHandlerOptions): (job: Job, signal: AbortSignal) => Promise<void> {
	const { pool, teiUrl, model, revision } = options;
	const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
	const timeoutMs = options.timeoutMs ?? CLASSIFIER_TIMEOUT_MS;

	return async (job, signal) => {
		const isRow = job.subjectKind === 'database_row';
		if ((!isRow && job.subjectKind !== 'page_comment') || !UUID.test(job.subjectId)) {
			log({ event: 'sentiment_skip', reason: 'subject_kind' });
			return;
		}
		const ids = { subjectKind: job.subjectKind, subjectId: job.subjectId };

		const current = (await pool.query<{ content: string }>(isRow ? READ_ROW : READ, [job.subjectId])).rows[0];
		if (!current || current.content.trim().length === 0) return;

		const [prediction] = await teiPredict(teiUrl, [current.content], { timeoutMs, signal });
		if (!prediction) throw new TeiError('shape', 'no prediction for the text');
		const { label, confidence } = pickLabel(prediction);
		if (signal.aborted) return;

		// A row is written only under the sha the job was queued for (C142);
		// the comment keeps its existing guard, which hashes the text it read.
		const contentSha256 = isRow ? (job.contentSha256 ?? '') : sha256Hex(current.content);
		const written = await pool.query(isRow ? WRITE_ROW : WRITE, [
			job.subjectId,
			label,
			confidence,
			model,
			revision,
			contentSha256,
		]);
		log({ event: written.rowCount ? 'sentiment_scored' : 'sentiment_stale', ...ids });
	};
}
