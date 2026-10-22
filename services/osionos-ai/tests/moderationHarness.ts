import { createHash, randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach } from 'node:test';
import { Pool } from 'pg';
import { createL1Handler } from '../src/moderation/l1.ts';
import { DEFAULT_HOLD, DEFAULT_MODEL, DEFAULT_REVISION, computePolicyHash, resolvePolicy } from '../src/moderation/policy.ts';
import type { ModerationPolicy } from '../src/moderation/policy.ts';
import type { Job } from '../src/jobs/queue.ts';
import { startMockTei } from './mockTei.ts';

/**
 * The shared setup of the L1 moderation tests: the real database of the
 * harness (the triggers of the moderation migration, the audit table, the soft
 * state), the mock classifier, and the fixture rows.
 *
 * It needs the moderation migration (and the jobs one): a run without it
 * skips, see `ready`.
 */

export const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';
export const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

const present = await pool.query(
	"select to_regclass('public.ai_moderation_events') as events, to_regclass('public.ai_jobs') as jobs",
);
export const ready = Boolean(present.rows[0]?.events) && Boolean(present.rows[0]?.jobs);

export const WS_PRIVATE = randomUUID();
export const WS_PUBLIC = randomUUID();
export const PAGE_PUBLIC = randomUUID(); // public page in a private workspace
export const PAGE_PRIVATE = randomUUID(); // private page in a private workspace
export const PAGE_ARCHIVED = randomUUID();
export const AUTHOR = randomUUID();
export const GOOD_HASH = computePolicyHash({ model: DEFAULT_MODEL, revision: DEFAULT_REVISION, hold: DEFAULT_HOLD });

export const mock = await startMockTei({ score: (text) => (text.includes('toxic') ? 0.97 : 0.03) });
export const logs: Record<string, unknown>[] = [];

export function policy(actions: string, calibrated: string = GOOD_HASH): ModerationPolicy {
	return resolvePolicy({
		OSIONOS_MODERATION_ACTIONS: actions,
		OSIONOS_MODERATION_L1_URL: mock.baseUrl,
		OSIONOS_MODERATION_CALIBRATED_POLICY: calibrated,
	});
}

export function handler(actions: string, calibrated?: string) {
	return createL1Handler({ pool, policy: policy(actions, calibrated), log: (entry) => logs.push(entry) });
}

export type Kind = 'feed_comment' | 'page_comment';
const TABLE: Record<Kind, string> = { feed_comment: 'osionos_feed_comments', page_comment: 'osionos_page_comments' };

export async function comment(kind: Kind, content: string, page = PAGE_PUBLIC): Promise<string> {
	const id = randomUUID();
	await pool.query(`insert into public.${TABLE[kind]} (id, page_id, author_id, content) values ($1, $2, $3, $4)`, [
		id,
		page,
		AUTHOR,
		content,
	]);
	return id;
}

export const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function job(kind: Kind, id: string, content: string, workspace: string = WS_PRIVATE): Job {
	return {
		kind: 'moderate',
		subjectKind: kind,
		subjectId: id,
		workspaceId: workspace,
		priority: 5,
		attempts: 0,
		enqueuedAt: new Date().toISOString(),
		contentSha256: sha(content),
	};
}

export async function events(id: string) {
	const result = await pool.query('select * from public.ai_moderation_events where subject_id = $1 order by id', [id]);
	return result.rows;
}

export async function row(kind: Kind, id: string) {
	const result = await pool.query(
		`select content, moderation_state, moderation_changed_at from public.${TABLE[kind]} where id = $1`,
		[id],
	);
	return result.rows[0];
}

export const signal = new AbortController().signal;

/** Registers the hooks of the file that imports the harness. */
export function installHooks(): void {
	before(async () => {
		if (!ready) return;
		await pool.query(`insert into public.osionos_workspaces (id, owner_id, visibility) values
			($1, $3, 'confidential'), ($2, $3, 'public')`, [WS_PRIVATE, WS_PUBLIC, AUTHOR]);
		await pool.query(`insert into public.osionos_pages (id, workspace_id, owner_id, visibility, archived_at) values
			($1, $4, $5, 'public', null),
			($2, $4, $5, 'private', null),
			($3, $4, $5, 'public', now())`, [PAGE_PUBLIC, PAGE_PRIVATE, PAGE_ARCHIVED, WS_PRIVATE, AUTHOR]);
	});

	beforeEach(async () => {
		logs.length = 0;
		mock.setOptions({ fail: false, onRequest: undefined, toxicLabel: 'toxic' });
	});

	afterEach(async () => {
		if (ready) await pool.query('delete from public.ai_jobs');
	});

	after(async () => {
		if (ready) {
			// The audit is append-only; the erase switch is the migration's own door.
			const client = await pool.connect();
			try {
				await client.query('begin');
				await client.query("select set_config('osionos.moderation_erase', 'on', true)");
				await client.query('delete from public.ai_moderation_events where author_id = $1', [AUTHOR]);
				await client.query('commit');
			} finally {
				client.release();
			}
		}
		await mock.close();
		await pool.end();
	});
}
