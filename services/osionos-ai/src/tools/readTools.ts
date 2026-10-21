import type { QueryResultRow } from 'pg';
import { z } from 'zod';
import { canReadPageRowAsMember } from '../../../../scripts/bridge-page-read.mjs';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { DEFAULT_LIMIT, retrieve } from '../retrieval/search.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import { pageBlock } from '../runs/prompt.ts';
import { SOURCE_INSTRUCTION, sourceBlock } from '../runs/sources.ts';
import type { AnyReadTool, ReadTool } from './types.ts';

/**
 * The read tools of the assistant: the search of a workspace, and the reading
 * of a page.
 *
 * Both read the workspace the caller belongs to, and both read it through the
 * bridge's own rule: a page the caller may not read does not exist for them,
 * and the answer never says why. The rule is applied to the row of the page,
 * after it is read, so a stale copy of the permissions can never leak it.
 *
 * The text of a page comes back as data: the blocks are the ones the prompt
 * quotes, so a page cannot forge a source of its own through a tool either.
 */

/** The characters of a page a tool reads: the first ones are enough to answer. */
export const TOOL_PAGE_CHARS = 12_000;

/** The characters of the snippet of a source: the ones of the retrieval. */
const SNIPPET_CHARS = 400;

/** The shape of a uuid: the ids that are not uuids can never be one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The most passages a search brings back. */
const MAX_SEARCH_LIMIT = 20;

/**
 * The arguments of the search.
 *
 * The schema is LOOSE on purpose. The SDK refuses a call whose arguments do
 * not fit the schema, and that refusal ends the run: a model that calls the
 * tool with the wrong shape must not kill a run that has already paid for
 * it. The schema tells the model what the tool wants, and the tool answers
 * with what it needs when the call is wrong.
 */
const searchArgs = z.object({
	/** What to look for. */
	query: z.unknown().optional().describe('the words to look for, as a sentence'),
	/** How many passages to bring back. */
	limit: z.unknown().optional().describe(`how many passages to bring back, at most ${MAX_SEARCH_LIMIT}`),
});

/** The arguments of the read of a page. Loose, like the ones of the search. */
const readPageArgs = z.object({
	/** The id of the page, as the search gives it. */
	pageId: z.unknown().optional().describe('the id of the page, a uuid'),
});

/** The row of a page, as the read rule reads it. */
interface PageRow extends QueryResultRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
	text: string | null;
}

/**
 * The row of a page, and one character more than the tool reads: the extra
 * character says whether the page is longer than what comes back.
 */
const PAGE_SQL = `
	select id, workspace_id, owner_id, visibility, collaborators, title,
	       left(public.osionos_page_text(content), $2::int) as text
	from public.osionos_pages
	where id = $1::uuid and archived_at is null`;

/** What the read of a page holds. */
export interface ReadPageData {
	/** The id of the page. */
	pageId: string;
	/** The title of the page. */
	title: string;
	/** The text of the page, cut to TOOL_PAGE_CHARS. */
	text: string;
	/** Whether the page is longer than the text that comes back. */
	truncated: boolean;
}

/** What the search holds. */
export interface SearchData {
	/** The passages that answer the question. */
	chunks: readonly RetrievedChunk[];
}

/** The snippet of a source: the beginning of its text. */
function snippet(text: string): string {
	if (text.length <= SNIPPET_CHARS) return text;
	return `${text.slice(0, SNIPPET_CHARS - 1)}…`;
}

/** The words of a search: the call must carry some. */
function searchWords(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** The number of passages of a search: the call may ask for fewer. */
function searchLimit(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
	return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.trunc(value)));
}

/**
 * The search of a workspace: the passages of the caller's workspaces that
 * answer a question.
 *
 * It is the retrieval of the run, called by the model instead of by the route:
 * the same statement, the same permission predicate, the same second check
 * with the bridge's own rule. The workspaces are read live, at the moment of
 * the call.
 */
export const searchWorkspace: ReadTool<z.infer<typeof searchArgs>, SearchData> = {
	name: 'search_workspace',
	description:
		'Search the pages of the workspaces the user belongs to, and get the passages that answer a question. Use it when the question is about the workspace and the pages already in the conversation do not answer it.',
	kind: 'read',
	input: searchArgs,
	async run(ctx, args) {
		const query = searchWords(args.query);
		if (query.length === 0) {
			return { ok: false, error: 'the search needs the words to look for' };
		}
		try {
			const chunks = await retrieve(ctx.db, ctx.user, {
				query,
				limit: searchLimit(args.limit),
			});
			return { ok: true, data: { chunks } };
		} catch (error) {
			// The search is a convenience: a search that fails is an answer
			// without passages, never a failed run. The failure is logged once,
			// the way the retrieval of a run logs it: the class and the
			// message of the error, and never the query — the words the user
			// searched for do not belong in a log.
			const name = error instanceof Error ? error.name : 'retrieval_failed';
			const message = error instanceof Error ? error.message : String(error);
			console.warn(JSON.stringify({ event: 'tool_search_failed', name, message }));
			return { ok: false, error: 'the search failed: the pages could not be reached' };
		}
	},
	render(data, cites) {
		if (data.chunks.length === 0) return 'No page of your workspaces answers that search.';
		// A passage the run already quoted is NOT quoted again: it keeps
		// the number it was given, and the model is told it matches.
		const blocks: string[] = [];
		const already: number[] = [];
		for (const [index, chunk] of data.chunks.entries()) {
			const cite = cites[index];
			if (cite.fresh) {
				blocks.push(sourceBlock(chunk, cite.n));
				continue;
			}
			if (!already.includes(cite.n)) already.push(cite.n);
		}
		already.sort((left, right) => left - right);
		const parts = [SOURCE_INSTRUCTION, ...blocks];
		if (already.length > 0) {
			parts.push(`Also matching, already quoted above: ${already.map((n) => `[${n}]`).join(', ')}.`);
		}
		return parts.join('\n\n');
	},
	sources(data) {
		return data.chunks;
	},
};

/**
 * The read of a page: its title and its text.
 *
 * The page is read with the rule of the bridge: the caller must be a member
 * of the workspace of the page, and the page must be readable by them. An
 * archived page does not exist: the archive is not a read.
 */
export const readPage: ReadTool<z.infer<typeof readPageArgs>, ReadPageData> = {
	name: 'read_page',
	description:
		'Read one page of the workspaces the user belongs to, in full. Use it after a search, to read the page a passage came from.',
	kind: 'read',
	input: readPageArgs,
	async run(ctx, args) {
		const pageId = typeof args.pageId === 'string' ? args.pageId.trim() : '';
		if (!UUID.test(pageId)) {
			return { ok: false, error: 'the read needs the id of the page, a uuid' };
		}
		const workspaces = await liveMemberWorkspaces(ctx.db, ctx.user);
		const result = await ctx.db.query<PageRow>(PAGE_SQL, [pageId, TOOL_PAGE_CHARS + 1]);
		const row = result.rows[0];
		// A page that does not exist, and a page the caller may not read, are
		// the same thing: the answer must not tell that it exists.
		if (!row || !canReadPageRowAsMember(row, ctx.user.userId, workspaces)) {
			return { ok: false, error: 'no page with that id in your workspaces' };
		}
		const text = String(row.text ?? '');
		const truncated = text.length > TOOL_PAGE_CHARS;
		return {
			ok: true,
			data: {
				pageId: String(row.id),
				title: String(row.title ?? ''),
				text: truncated ? text.slice(0, TOOL_PAGE_CHARS) : text,
				truncated,
			},
		};
	},
	render(data) {
		const block = pageBlock({ id: data.pageId, title: data.title, text: data.text });
		if (!data.truncated) return block;
		return `${block}\n\n(this page is longer: this is its first ${TOOL_PAGE_CHARS} characters)`;
	},
	sources(data) {
		return [
			{
				pageId: data.pageId,
				blockId: null,
				title: data.title,
				headingPath: data.title,
				snippet: snippet(data.text),
				score: 0,
			},
		];
	},
};

/** The read tools, in the order the model sees them. */
export const READ_TOOLS: readonly AnyReadTool[] = Object.freeze([searchWorkspace, readPage]);
