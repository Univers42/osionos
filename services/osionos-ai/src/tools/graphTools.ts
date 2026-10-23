import type { Pool } from 'pg';
import { z } from 'zod';
import { readLinkEdgesFromDb } from '../../../../scripts/bridge-graph-edges.mjs';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { relatedPages } from '../retrieval/related.ts';
import { readablePages } from '../retrieval/search.ts';
import { attributeText } from '../runs/sources.ts';
import type { ReadTool, ReadToolContext } from './types.ts';

/**
 * The graph read of the assistant: the neighbours of a page.
 *
 * The walk follows the links of the workspace like a person follows them: the
 * pages a page links to, the pages that link to it, its parent, its
 * sub-pages, and the pages most like it. ONE rule holds at every hop: a page
 * the caller may not read does not exist for them, the walk never goes
 * THROUGH such a page (C100), and the answer carries no count and no degree
 * (C99): the pages themselves, nothing else.
 */

/** The kinds of neighbours, in the order the answer lists them. */
const KINDS = ['link', 'backlink', 'parent', 'child', 'related'] as const;

/** The kind of one neighbour. */
export type NeighborKind = (typeof KINDS)[number];

/** The most neighbours a call brings back. */
const MAX_NEIGHBORS = 50;
/** The neighbours of a call that says nothing about the number. */
const DEFAULT_NEIGHBORS = 20;
/** The nodes of the first hop. */
const HOP1_CAP = 50;
/** The nodes of the two hops together. */
const TOTAL_CAP = 200;
/** The related pages of the start page: one kNN per call is the budget. */
const RELATED_LIMIT = 8;
/** The children read for one parent: one more than the cap of the hop. */
const CHILD_LIMIT = 51;
/** The answer of a page that does not exist for the caller (C101). */
const NOT_FOUND = 'no page with that id in your workspaces';

/** The shape of a uuid: the ids that are not uuids can never be one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The arguments of the walk. LOOSE, like the ones of the read of a page: the
 * SDK refuses a call whose arguments do not fit the schema, and that ends
 * the run.
 */
const graphNeighborsArgs = z.object({
	pageId: z.unknown().optional().describe('the id of the page, a uuid'),
	depth: z.unknown().optional().describe('how many hops to walk: 1 or 2'),
	kinds: z.unknown().optional().describe(`the kinds of neighbours to walk: ${KINDS.join(', ')}`),
	limit: z.unknown().optional().describe(`how many neighbours to bring back, at most ${MAX_NEIGHBORS}`),
});

/** One neighbour of the answer: the title is empty until the rule passes it. */
export interface GraphNeighbor {
	/** The id of the page. */
	pageId: string;
	/** The kind of the edge it was found through. */
	kind: NeighborKind;
	/** The hop it was found at: 1 or 2. */
	depth: number;
	/** The hop-1 page it was found through, for a depth-2 neighbour. */
	via: string | null;
	/** Its title. */
	title: string;
}

/** What the walk holds: the neighbours, and the title of every way in. */
export interface GraphNeighborsData {
	/** The neighbours, in the order of the answer. */
	nodes: readonly GraphNeighbor[];
	/** The title of every hop-1 page a depth-2 neighbour came through. */
	viaTitles: Readonly<Record<string, string>>;
}

/**
 * The parents of a set of pages: the RAW rows. The read rule decides right
 * after, and an id the caller may not read never leaves this module.
 */
const PARENTS_SQL = `
	select id, parent_page_id
	from public.osionos_pages
	where id = any($1::uuid[]) and archived_at is null`;

/**
 * The children of a set of pages: at most CHILD_LIMIT of each parent. The
 * window keeps the bound PER PARENT, so a page with three hundred children
 * does not eat the children of the others.
 */
const CHILDREN_SQL = `
	select id, parent_page_id
	from (
		select id, parent_page_id,
		       row_number() over (partition by parent_page_id order by id) as rn
		from public.osionos_pages
		where parent_page_id = any($1::uuid[]) and archived_at is null
	) children
	where children.rn <= $2`;

/** The arguments of the walk, read out of the loose schema. */
function argsOf(args: z.infer<typeof graphNeighborsArgs>): { pageId: string; depth: 1 | 2; kinds: NeighborKind[]; limit: number } {
	const asked = Array.isArray(args.kinds) ? args.kinds : [];
	const kinds = KINDS.filter((kind) => asked.includes(kind));
	const limit = typeof args.limit === 'number' ? args.limit : Number.NaN;
	return {
		pageId: typeof args.pageId === 'string' ? args.pageId.trim() : '',
		// One hop or two: anything else is one hop.
		depth: args.depth === 2 ? 2 : 1,
		kinds: kinds.length > 0 ? kinds : [...KINDS],
		limit: Number.isFinite(limit) ? Math.min(MAX_NEIGHBORS, Math.max(1, Math.trunc(limit))) : DEFAULT_NEIGHBORS,
	};
}

/** The order of the answer: the kind first, then the title, then the id. */
function byKindThenTitle(a: GraphNeighbor, b: GraphNeighbor): number {
	const kind = KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind);
	if (kind !== 0) return kind;
	const title = a.title.localeCompare(b.title, 'en');
	if (title !== 0) return title;
	return a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0;
}

/**
 * The neighbours of a set of pages, per kind, BEFORE the read rule. The
 * links come from the ONE edge read of the graph: both ends of an edge are
 * checked against their live page row, so a link to a page the caller may not
 * read is not a link at all. The parents and the children are read live.
 */
async function collect(
	db: Pool,
	ctx: ReadToolContext,
	workspaces: readonly string[],
	sources: readonly string[],
	kinds: readonly NeighborKind[],
	depth: number,
): Promise<GraphNeighbor[]> {
	const out: GraphNeighbor[] = [];
	// Nothing to walk from: the walk asks the database about nothing.
	if (sources.length === 0) return out;
	/** One candidate: the page, the kind, and the hop-1 page it came through. */
	const add = (pageId: string, kind: NeighborKind, from: string | null): void => {
		out.push({ pageId, title: '', kind, depth, via: depth === 2 ? from : null });
	};
	if (kinds.includes('link')) {
		const { links } = await readLinkEdgesFromDb(db, { sourceIds: [...sources], userId: ctx.user.userId, workspaces });
		for (const link of links) add(link.target, 'link', link.source);
	}
	if (kinds.includes('backlink')) {
		const { links } = await readLinkEdgesFromDb(db, { targetIds: [...sources], userId: ctx.user.userId, workspaces });
		for (const link of links) add(link.source, 'backlink', link.target);
	}
	if (kinds.includes('parent')) {
		const rows = await db.query<{ id: string; parent_page_id: string | null }>(PARENTS_SQL, [[...sources]]);
		for (const row of rows.rows) {
			if (!row.parent_page_id) continue;
			add(String(row.parent_page_id), 'parent', String(row.id));
		}
	}
	if (kinds.includes('child')) {
		const rows = await db.query<{ id: string; parent_page_id: string }>(CHILDREN_SQL, [[...sources], CHILD_LIMIT]);
		for (const row of rows.rows) add(String(row.id), 'child', String(row.parent_page_id));
	}
	if (kinds.includes('related') && depth === 1) {
		// The kNN of ONE call is the budget: there is no related at hop 2.
		const related = await relatedPages(db, ctx.user, sources[0], RELATED_LIMIT);
		for (const page of related ?? []) add(page.pageId, 'related', null);
	}
	return out;
}

/**
 * The candidates the caller may read: the order of the answer, one page once.
 * The rule is the retrieval's own: the LIVE row of the page and the bridge's
 * function. A page that is gone, archived, or hidden is dropped here.
 */
async function kept(db: Pool, ctx: ReadToolContext, workspaces: readonly string[], candidates: readonly GraphNeighbor[]): Promise<GraphNeighbor[]> {
	const pages = await readablePages(db, [...new Set(candidates.map((c) => c.pageId))], ctx.user, workspaces);
	const titled = candidates.filter((c) => pages.has(c.pageId.toLowerCase())).map((c) => ({ ...c, title: String(pages.get(c.pageId.toLowerCase())?.title ?? '') }));
	const seen = new Set<string>();
	return titled.sort(byKindThenTitle).filter((candidate) => {
		const id = candidate.pageId.toLowerCase();
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}

/**
 * The neighbours of a page: the walk of the links of the workspace.
 *
 * The start page is read with the rule of the bridge: a page the caller may
 * not read, an archived one, and an id that is not a page are one answer
 * (C101). The hop-2 nodes come from the hop-1 nodes the caller may read, and
 * from no other: the walk never goes through a page they may not (C100).
 */
export const graphNeighbors: ReadTool<z.infer<typeof graphNeighborsArgs>, GraphNeighborsData> = {
	name: 'graph_neighbors',
	description:
		"List the pages linked to a page of the user's workspaces: the pages it links to, the pages that link to it, its parent, its sub-pages, and the pages most like it. Use it to follow the links from a page you already found.",
	kind: 'read',
	input: graphNeighborsArgs,
	async run(ctx, args) {
		const { pageId, depth, kinds, limit } = argsOf(args);
		// A page the caller may not read does not exist for them: the answer
		// is the same for a hidden page, an archived one, and a missing id.
		if (!UUID.test(pageId)) return { ok: false, error: NOT_FOUND };
		const workspaces = await liveMemberWorkspaces(ctx.db, ctx.user);
		const start = await readablePages(ctx.db, [pageId], ctx.user, workspaces);
		if (!start.has(pageId.toLowerCase())) return { ok: false, error: NOT_FOUND };

		// The first hop: the neighbours of the start page.
		const raw1 = await collect(ctx.db, ctx, workspaces, [pageId], kinds, 1);
		const hop1 = (await kept(ctx.db, ctx, workspaces, raw1)).slice(0, HOP1_CAP);

		// The second hop: ONLY from the hop-1 nodes the caller may read. A
		// neighbour they may not read is not a way in (C100).
		let hop2: GraphNeighbor[] = [];
		const kinds2 = kinds.filter((kind) => kind !== 'related');
		if (depth === 2 && kinds2.length > 0) {
			const sources = hop1.map((node) => node.pageId);
			const taken = new Set([pageId.toLowerCase(), ...sources.map((id) => id.toLowerCase())]);
			const raw2 = await collect(ctx.db, ctx, workspaces, sources, kinds2, 2);
			hop2 = (await kept(ctx.db, ctx, workspaces, raw2))
				.filter((candidate) => !taken.has(candidate.pageId.toLowerCase()))
				.slice(0, Math.max(0, TOTAL_CAP - hop1.length));
		}

		// The answer: the first `limit` nodes, in the order of the answer.
		const viaTitles: Record<string, string> = {};
		for (const candidate of hop1) viaTitles[candidate.pageId.toLowerCase()] = candidate.title;
		return { ok: true, data: { nodes: [...hop1, ...hop2].sort(byKindThenTitle).slice(0, limit), viaTitles } };
	},
	render(data) {
		if (data.nodes.length === 0) return 'This page has no linked pages you can read.';
		return data.nodes
			.map((node) => {
				const via = node.via ? `, via "${attributeText(data.viaTitles[node.via.toLowerCase()] ?? '')}"` : '';
				return `- [${node.kind}, depth ${node.depth}] "${attributeText(node.title)}" (id ${node.pageId}${via})`;
			})
			.join('\n');
	},
	// A title is not a passage: the model reads the page with read_page first.
	sources() {
		return [];
	},
};
