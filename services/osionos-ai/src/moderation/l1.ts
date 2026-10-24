/**
 * The L1 handler of the 'moderate' jobs: one public comment in, one audit row
 * out, and — only in hold mode — the comment moved to 'held'.
 *
 * What it NEVER does: take a comment away (the one state it writes is 'held',
 * C83/C84), erase a row (C86), look at content that is not public (C94), or
 * let a verdict of old content land on new content (C89).
 *
 * Fail-open (C90): a classifier error throws, the job worker retries with
 * backoff, and the comment stays visible meanwhile.
 *
 * Caveat: the toxic label is found by name — 'toxic' (the id2label of
 * textdetox/xlmr-large-toxicity-classifier-v2, measured in the A1 spike) or
 * 'LABEL_1' (the same index when a server hides the names). Another model
 * with other names throws a shape error instead of guessing, so a model swap
 * is loud, never a silent allow.
 */

import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { TeiError, teiPredict } from '../encoders/tei.ts';
import type { LabelScore } from '../encoders/tei.ts';
import type { Job } from '../jobs/queue.ts';
import type { ModerationPolicy } from './policy.ts';

export interface L1HandlerOptions {
	pool: Pool;
	policy: ModerationPolicy;
	/** One entry per decision: ids, action, mode — never the text or the score. */
	log?: (entry: Record<string, unknown>) => void;
	/** The bound on one classifier call, in milliseconds. */
	timeoutMs?: number;
}

/** The comment tables the migration's triggers enqueue, by subject kind. */
const TABLES: Record<string, string> = {
	feed_comment: 'osionos_feed_comments',
	page_comment: 'osionos_page_comments',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASSIFIER_TIMEOUT_MS = 15_000;

// The C89 guard, once: the row's content hash is the hash the job carries.
// Every statement that writes on the strength of a verdict uses it.
function shaMatches(content: string, param: string): string {
	return `encode(sha256(convert_to(${content}, 'UTF8')), 'hex') = ${param}`;
}

// The comment as the handler may moderate it: its page is live and public, or
// its workspace is (the trigger's own rule, re-checked now — C94).
function subjectFrom(table: string): string {
	return `from public.${table} c
	  join public.osionos_pages p on p.id = c.page_id
	  join public.osionos_workspaces w on w.id = p.workspace_id
	 where c.id = $1::uuid
	   and p.archived_at is null
	   and (p.visibility = 'public' or w.visibility = 'public')`;
}

interface Statements {
	read: string;
	lock: string;
	hold: string;
}

function statementsFor(table: string): Statements {
	const columns = 'select c.content, c.author_id, p.workspace_id';
	return {
		read: `${columns} ${subjectFrom(table)}`,
		// The lock holds the row still while the audit row and the state are
		// written, so the content cannot change between the check and the write.
		lock: `${columns} ${subjectFrom(table)} and ${shaMatches('c.content', '$2')} for update of c`,
		hold: `update public.${table}
		   set moderation_state = 'held', moderation_changed_at = now()
		 where id = $1::uuid and moderation_state = 'visible' and ${shaMatches('content', '$2')}`,
	};
}

const STATEMENTS: Record<string, Statements> = Object.fromEntries(
	Object.entries(TABLES).map(([kind, table]) => [kind, statementsFor(table)]),
);

const INSERT_EVENT = `
insert into public.ai_moderation_events
  (subject_kind, subject_id, workspace_id, author_id, layer, actor_id, action, mode, scores, policy_hash, content_sha256, reason)
values ($1, $2, $3, $4, 'l1', null, $5, $6, $7::jsonb, $8, $9, null)`;

interface SubjectRow {
	content: string;
	author_id: string | null;
	workspace_id: string | null;
}

const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The score of the toxic label of one prediction. */
export function toxicScore(prediction: LabelScore[]): number {
	const found = prediction.find((entry) => {
		const label = entry.label.toLowerCase();
		return label === 'toxic' || label === 'label_1';
	});
	if (!found) throw new TeiError('shape', 'the prediction has no toxic label');
	return found.score;
}

/** The handler of the 'moderate' kind, for JobWorker. */
export function createL1Handler(options: L1HandlerOptions): (job: Job, signal: AbortSignal) => Promise<void> {
	const { pool, policy } = options;
	const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
	const timeoutMs = options.timeoutMs ?? CLASSIFIER_TIMEOUT_MS;
	const unknownKinds = new Set<string>();
	if (policy.mode === 'off') throw new Error('the L1 handler is not built for the off mode');

	// The audit row, then the state, in one transaction. It writes nothing when
	// the row no longer matches the job (edited, made private, gone).
	async function record(job: Job, table: Statements, action: 'allow' | 'hold', score: number): Promise<boolean> {
		const client = await pool.connect();
		try {
			await client.query('begin');
			const locked = await client.query<SubjectRow>(table.lock, [job.subjectId, job.contentSha256]);
			const subject = locked.rows[0];
			if (!subject) {
				await client.query('rollback');
				return false;
			}
			await client.query(INSERT_EVENT, [
				job.subjectKind,
				job.subjectId,
				subject.workspace_id,
				subject.author_id,
				action,
				policy.mode,
				JSON.stringify({ toxic: score }),
				policy.policyHash,
				job.contentSha256,
			]);
			if (policy.mode === 'hold' && action === 'hold') {
				await client.query(table.hold, [job.subjectId, job.contentSha256]);
			}
			await client.query('commit');
			return true;
		} catch (error) {
			await client.query('rollback').catch(() => undefined);
			throw error;
		} finally {
			client.release();
		}
	}

	return async (job, signal) => {
		const table = STATEMENTS[job.subjectKind];
		if (!table) {
			if (!unknownKinds.has(job.subjectKind)) {
				unknownKinds.add(job.subjectKind);
				log({ event: 'unknown_subject_kind', subjectKind: job.subjectKind });
			}
			return;
		}
		if (!UUID.test(job.subjectId)) return;
		const ids = { subjectKind: job.subjectKind, subjectId: job.subjectId };

		const current = (await pool.query<SubjectRow>(table.read, [job.subjectId])).rows[0];
		if (!current) return;
		if (job.contentSha256 !== sha256Hex(current.content)) {
			log({ event: 'stale_job_skipped', ...ids });
			return;
		}

		const [prediction] = await teiPredict(policy.l1Url, [current.content], { timeoutMs, signal });
		if (!prediction) throw new TeiError('shape', 'no prediction for the text');
		const score = toxicScore(prediction);
		if (signal.aborted) return;

		const action = score >= policy.hold ? 'hold' : 'allow';
		if (!(await record(job, table, action, score))) {
			log({ event: 'stale_job_skipped', ...ids });
			return;
		}
		log({ event: 'moderation_decision', ...ids, action, mode: policy.mode });
	};
}
