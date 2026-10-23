import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { canReadPageRowAsMember } from '../../../../scripts/bridge-page-read.mjs';
import { liveMemberWorkspaces, pageRowReadableSql } from '../retrieval/acl.ts';

/**
 * What the sentiment scores are allowed to show: weekly totals of a workspace
 * and the mood of one thread, and only when at least PULSE_MIN_AUTHORS distinct
 * people stand behind the number (C140). Nothing here is keyed by author.
 */

export const PULSE_MIN_AUTHORS = 5;

export type SentimentLabel = 'negative' | 'neutral' | 'positive';
const LABELS: readonly SentimentLabel[] = ['negative', 'neutral', 'positive'];

export interface PulseWeek {
	weekStart: string;
	negative: number;
	neutral: number;
	positive: number;
}

export type Pulse = { enabled: false; weeks: [] } | { enabled: true; minAuthors: number; weeks: PulseWeek[] };

/** A score counts only while the comment still has the content that was scored (C142). */
const FRESH_JOIN = `
	join public.ai_sentiment s
	  on s.subject_kind = 'page_comment'
	 and s.subject_id = c.id::text
	 and s.content_sha256 = encode(sha256(convert_to(c.content, 'UTF8')), 'hex')`;

/*
 * Caveat: only COMPLETED weeks are counted. With the current week in, a viewer
 * could diff two requests and learn the label of one new comment. This does not
 * stop the same trick on the past: an edit or a delete of an old comment still
 * moves a past bucket, so k >= 5 is k-anonymity, not differential privacy. The
 * week boundary follows the session time zone of the database.
 */
const PULSE_SQL = `
	select to_char(date_trunc('week', c.created_at), 'YYYY-MM-DD') as week_start,
	       (count(*) filter (where s.label = 'negative'))::int as negative,
	       (count(*) filter (where s.label = 'neutral'))::int as neutral,
	       (count(*) filter (where s.label = 'positive'))::int as positive
	from public.osionos_page_comments c
	join public.osionos_pages p on p.id = c.page_id
	${FRESH_JOIN}
	where p.workspace_id = $1::uuid
	  and p.archived_at is null
	  and ${pageRowReadableSql('p', '$2')}
	  and c.created_at < date_trunc('week', now())
	  and c.created_at >= date_trunc('week', now()) - make_interval(weeks => $3::int)
	group by date_trunc('week', c.created_at)
	having count(distinct c.author_id) >= ${PULSE_MIN_AUTHORS}
	order by date_trunc('week', c.created_at)`;

async function isEnabled(db: Pool, workspaceId: string): Promise<boolean> {
	const result = await db.query<{ enabled: boolean }>(
		'select enabled from public.ai_sentiment_settings where workspace_id = $1',
		[workspaceId],
	);
	return result.rows[0]?.enabled === true;
}

/** The weekly totals of the last `weeks` completed weeks; a week below k is absent. */
export async function readPulse(db: Pool, user: AuthUser, workspaceId: string, weeks: number): Promise<Pulse> {
	if (!(await isEnabled(db, workspaceId))) return { enabled: false, weeks: [] };
	const result = await db.query<{ week_start: string; negative: number; neutral: number; positive: number }>(PULSE_SQL, [
		workspaceId,
		user.userId,
		weeks,
	]);
	return {
		enabled: true,
		minAuthors: PULSE_MIN_AUTHORS,
		weeks: result.rows.map((row) => ({
			weekStart: row.week_start,
			negative: row.negative,
			neutral: row.neutral,
			positive: row.positive,
		})),
	};
}

export interface ThreadMood {
	mood: SentimentLabel | null;
	share?: number;
}

const PAGE_SQL = `
	select id, workspace_id, owner_id, visibility, collaborators
	from public.osionos_pages
	where id = $1::uuid and archived_at is null`;

const MOOD_SQL = `
	select count(distinct c.author_id)::int as authors,
	       (count(*) filter (where s.label = 'negative'))::int as negative,
	       (count(*) filter (where s.label = 'neutral'))::int as neutral,
	       (count(*) filter (where s.label = 'positive'))::int as positive
	from public.osionos_page_comments c
	${FRESH_JOIN}
	where c.page_id = $1::uuid`;

/**
 * The mood of one thread, or null when the page is not readable by the caller
 * (the same answer for missing and forbidden, C101 style).
 *
 * Caveat: unlike the Pulse it includes the current week, so a thread that sits
 * at exactly 5 authors can flip its mood on one new comment; the answer is a
 * majority label, never a per-comment score.
 */
export async function readThreadMood(db: Pool, user: AuthUser, pageId: string): Promise<ThreadMood | null> {
	const page = (await db.query(PAGE_SQL, [pageId])).rows[0];
	if (!page) return null;
	const workspaces = await liveMemberWorkspaces(db, user);
	if (!canReadPageRowAsMember(page, user.userId, workspaces)) return null;
	if (!(await isEnabled(db, String(page.workspace_id)))) return { mood: null };

	const row = (await db.query<Record<string, number>>(MOOD_SQL, [pageId])).rows[0];
	const total = LABELS.reduce((sum, label) => sum + (row?.[label] ?? 0), 0);
	if (!row || row.authors < PULSE_MIN_AUTHORS || total === 0) return { mood: null };
	const top = LABELS.reduce((best, label) => (row[label] > row[best] ? label : best), LABELS[0]);
	return { mood: top, share: Math.round((row[top] / total) * 100) / 100 };
}
