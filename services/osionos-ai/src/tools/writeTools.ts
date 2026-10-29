import type { Pool, QueryResultRow } from 'pg';
import { z } from 'zod';
import { sameId } from '../../../../scripts/bridge-page-read.mjs';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { canReadPageWithRules } from '../retrieval/shareRules.ts';
import { canAccessWorkspace } from '../workspaceAccess.ts';
import { BLOCK_TYPES, TEXT_BLOCK_TYPES } from './blockTypes.ts';
import type { ApprovalTarget } from '../approvals/types.ts';
import type { AnyWriteTool, WriteTool, WriteToolContext } from './types.ts';

/**
 * The write tools of the assistant: the three writes it may ask for.
 *
 * None of them writes. A write tool validates its arguments, describes what it
 * is about to do, and stops: the assistant asks the user, and the write
 * happens only when the user says yes.
 *
 * The arguments are a strict WHITELIST. The model may send anything it likes:
 * the schema takes what it knows and drops the rest, so `visibility`,
 * `collaborators`, `properties`, `workspaceId` (on a page that exists) and
 * `archivedAt` never reach the bridge, whatever the model writes. The bridge
 * does not strip them for an owner, so this is the only place that can.
 *
 * A page may be created, renamed, archived, and written into: add_blocks adds
 * text blocks through the bridge's atomic append, so it never rewrites what is
 * already there. There is no delete, and no rewrite of an existing block: that
 * one waits for the strict page version (devil C227).
 */

/** The shape of a uuid: the ids that are not uuids can never be one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The longest title a page takes. */
const TITLE_MAX_CHARS = 200;

/**
 * The block types the MCP server writes (scripts/osionos-mcp-server.mjs:57).
 *
 * The list is the one of the MCP server: a block the app cannot draw is a
 * block the page must not carry.
 */
export { BLOCK_TYPES } from './blockTypes.ts';

/** One block of a page: an id, a type of the allow-list, and its text. */
const blockSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.enum(BLOCK_TYPES),
	content: z.string().max(10_000),
});

/** The most blocks a created page carries. */
const MAX_BLOCKS = 100;

/** The arguments of the creation of a page. */
const createPageArgs = z.object({
	title: z.string().min(1).max(TITLE_MAX_CHARS),
	workspaceId: z.string().regex(UUID),
	parentPageId: z.string().regex(UUID).optional(),
	content: z.array(blockSchema).max(MAX_BLOCKS).optional(),
});

/** The most blocks one add_blocks carries. */
const ADD_MAX_BLOCKS = 50;

/**
 * The most bytes of blocks one add_blocks carries. The bridge's append takes
 * 256 KB (APPEND_MAX_BYTES); the ids it gains at execution and the JSON of the
 * request need the rest.
 */
export const ADD_MAX_BYTES = 200_000;

/** The arguments of an addition to a page: text blocks, and where they go. */
const addBlocksArgs = z.object({
	pageId: z.string().regex(UUID),
	blocks: z
		.array(z.object({ type: z.enum(TEXT_BLOCK_TYPES), content: z.string().min(1).max(10_000) }))
		.min(1)
		.max(ADD_MAX_BLOCKS),
	after: z.string().min(1).max(500).optional(),
});

/** The arguments of the rename of a page: a title, and nothing else. */
const renamePageArgs = z.object({
	pageId: z.string().regex(UUID),
	title: z.string().min(1).max(TITLE_MAX_CHARS),
});

/** The arguments of the archive of a page: the page, and nothing else. */
const archivePageArgs = z.object({
	pageId: z.string().regex(UUID),
});

/** The row of a page, as the tools read it. */
interface PageRow extends QueryResultRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
}

/** The page, as the tools read it. */
const PAGE_SQL = `
	select id, workspace_id, owner_id, visibility, collaborators, title
	from public.osionos_pages
	where id = $1::uuid`;

/** The sub-pages of a page: the tree under it, archived ones apart. */
const SUB_PAGES_SQL = `
	with recursive tree as (
		select id from public.osionos_pages
		where parent_page_id = $1::uuid and archived_at is null
		union all
		select p.id from public.osionos_pages p
		join tree t on p.parent_page_id = t.id
		where p.archived_at is null
	)
	select count(*)::int as count from tree`;

/**
 * The top-level blocks of a page, and whether it is archived.
 *
 * Only the top level: the bridge's append addresses a top-level block (a block
 * nested in children or in a layout cell is an unknown id there, and the
 * blocks would land at the end of the page instead).
 */
const TOP_BLOCKS_SQL = `
	select p.archived_at is not null as archived,
	       coalesce(
	         (select jsonb_agg(jsonb_build_object('id', b ->> 'id', 'content', coalesce(b ->> 'content', '')) order by o)
	            from jsonb_array_elements(case when jsonb_typeof(p.content) = 'array' then p.content else '[]'::jsonb end)
	                 with ordinality as e(b, o)
	           where jsonb_typeof(b) = 'object' and b ? 'id'),
	         '[]'::jsonb
	       ) as blocks
	  from public.osionos_pages p
	 where p.id = $1::uuid`;

/** The name of a workspace, when the database knows it. */
const WORKSPACE_NAME_SQL = 'select name from public.osionos_workspaces where id = $1::uuid limit 1';

/** The role a collaborator carries on a page. */
function collaboratorRole(collaborators: unknown, userId: string): string {
	if (!Array.isArray(collaborators)) return '';
	for (const entry of collaborators) {
		if (!entry || typeof entry !== 'object') continue;
		const candidate = entry as { userId?: unknown; role?: unknown };
		if (typeof candidate.userId !== 'string' || !sameId(candidate.userId, userId)) continue;
		return typeof candidate.role === 'string' ? candidate.role : '';
	}
	return '';
}

/**
 * Whether the caller may write the page: the bridge's own rule.
 *
 * The workspace gate comes first (the bridge's ownerOrWorkspaceAccess), then
 * the page itself: the owner of the page, or a collaborator that carries the
 * role of an editor.
 */
async function mayWritePage(db: Pool, ctx: WriteToolContext, row: PageRow): Promise<boolean> {
	if (!(await canAccessWorkspace(db, ctx.user, row.workspace_id, 'update'))) return false;
	// A page nobody owns is a legacy row: the workspace gate is enough.
	if (!row.owner_id) return true;
	if (sameId(row.owner_id, ctx.user.userId)) return true;
	const role = collaboratorRole(row.collaborators, ctx.user.userId);
	return role === 'editor' || role === 'owner';
}

/**
 * The page the tool writes, when the caller may write it.
 *
 * A page that does not exist and a page the caller may not read are the same
 * thing: the answer must not tell that the page is there.
 */
export async function writablePage(ctx: WriteToolContext, pageId: string): Promise<PageRow | null> {
	const result = await ctx.db.query<PageRow>(PAGE_SQL, [pageId]);
	const row = result.rows[0];
	if (!row) return null;
	const workspaces = await liveMemberWorkspaces(ctx.db, ctx.user);
	if (!(await canReadPageWithRules(ctx.db, ctx.user.userId, row, workspaces))) return null;
	if (!(await mayWritePage(ctx.db, ctx, row))) return null;
	return row;
}

/** The name of a workspace: the card shows it beside the title. */
export async function workspaceName(db: Pool, workspaceId: string): Promise<string> {
	const result = await db.query<{ name: string }>(WORKSPACE_NAME_SQL, [workspaceId]);
	return result.rows[0]?.name ?? '';
}

/** The number of the sub-pages a page carries: what an archive takes with it. */
async function subPageCount(db: Pool, pageId: string): Promise<number> {
	const result = await db.query<{ count: number }>(SUB_PAGES_SQL, [pageId]);
	return Number(result.rows[0]?.count ?? 0);
}

/**
 * The creation of a page.
 *
 * The workspace is one of the caller's own, read LIVE: a membership that ends
 * ends at once. The parent, when there is one, must be a page the caller may
 * read AND write.
 */
export const createPage: WriteTool<z.infer<typeof createPageArgs>> = {
	name: 'create_page',
	description:
		'Ask the user to create a page in one of their workspaces. Use it when the answer belongs in a page of its own.',
	kind: 'write',
	verb: 'Create a page',
	input: createPageArgs,
	async run(ctx, args) {
		const workspaces = await liveMemberWorkspaces(ctx.db, ctx.user);
		if (!workspaces.includes(args.workspaceId)) {
			return { ok: false, error: 'that workspace is not one of yours' };
		}
		if (args.parentPageId) {
			const parent = await writablePage(ctx, args.parentPageId);
			if (!parent) return { ok: false, error: 'no page with that id in your workspaces' };
		}
		const target: ApprovalTarget = {
			title: args.title,
			workspaceId: args.workspaceId,
			workspaceName: await workspaceName(ctx.db, args.workspaceId),
		};
		return {
			ok: true,
			data: {
				// The arguments are the parsed ones: the schema is the
				// whitelist, so what is stored is what the schema knows.
				args: { ...args },
				target,
				preview: { unit: 'blocks', count: args.content?.length ?? 0 },
			},
		};
	},
};

/**
 * The rename of a page.
 *
 * A title, and nothing else: the content of a page is not written here, and
 * the properties of a page are never written by the assistant.
 */
export const renamePage: WriteTool<z.infer<typeof renamePageArgs>> = {
	name: 'rename_page',
	description:
		'Ask the user to rename one of their pages. Use it when the page has the wrong name; it changes the title and nothing else.',
	kind: 'write',
	verb: 'Rename a page',
	input: renamePageArgs,
	async run(ctx, args) {
		const page = await writablePage(ctx, args.pageId);
		if (!page) return { ok: false, error: 'no page with that id in your workspaces' };
		const target: ApprovalTarget = {
			pageId: String(page.id),
			title: args.title,
			workspaceId: String(page.workspace_id),
			workspaceName: await workspaceName(ctx.db, String(page.workspace_id)),
		};
		return {
			ok: true,
			data: {
				// The arguments are the parsed ones: the schema is the
				// whitelist, so a rename carries a title and a page, and
				// never a content nor a property.
				args: { ...args },
				target,
				preview: { unit: 'none', count: 0 },
			},
		};
	},
};

/**
 * The archive of a page.
 *
 * A SOFT archive: the page is stamped, not deleted, and it can be restored.
 * The preview counts the sub-pages that go with it, because that is what the
 * user is really deciding.
 */
export const archivePage: WriteTool<z.infer<typeof archivePageArgs>> = {
	name: 'archive_page',
	description:
		'Ask the user to archive one of their pages, and the pages under it. Use it when a page has to go out of the way; it can be restored later.',
	kind: 'write',
	verb: 'Archive a page',
	input: archivePageArgs,
	async run(ctx, args) {
		const page = await writablePage(ctx, args.pageId);
		if (!page) return { ok: false, error: 'no page with that id in your workspaces' };
		const target: ApprovalTarget = {
			pageId: String(page.id),
			title: String(page.title ?? ''),
			workspaceId: String(page.workspace_id),
			workspaceName: await workspaceName(ctx.db, String(page.workspace_id)),
		};
		return {
			ok: true,
			data: {
				// The arguments are the parsed ones: the schema is the
				// whitelist, so an archive carries a page and nothing else.
				args: { ...args },
				target,
				preview: { unit: 'sub_pages', count: await subPageCount(ctx.db, String(page.id)) },
			},
		};
	},
};

/** The text the card shows of the block the addition follows. */
const ANCHOR_TEXT_MAX_CHARS = 300;

/** Spaces folded, ends trimmed, case folded: how two texts of a block are compared. */
function foldText(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The top-level block `after` names: the one whose text is `after`, or else the
 * only one whose text starts with it.
 *
 * Caveat: a block is found by its text, not by its id — the model reads text
 * (read_page shows no ids). Two blocks with the same opening words are
 * ambiguous and refused, and a block nested under another one is not found:
 * the model then names the top-level block that holds it.
 */
export function anchorOf(
	blocks: readonly { id: string; content: string }[],
	after: string,
): { ok: true; id: string; text: string } | { ok: false; error: string } {
	const wanted = foldText(after);
	if (!wanted) return { ok: false, error: 'after names no block' };
	const exact = blocks.filter((block) => foldText(block.content) === wanted);
	const matches = exact.length > 0 ? exact : blocks.filter((block) => foldText(block.content).startsWith(wanted));
	if (matches.length === 0) {
		return {
			ok: false,
			error: 'no top-level block of the page starts with that text: quote the start of a heading or paragraph of the page, or leave after out to add at the end',
		};
	}
	if (matches.length > 1) return { ok: false, error: 'several blocks start with that text: quote more of the one you mean' };
	return { ok: true, id: matches[0].id, text: matches[0].content.slice(0, ANCHOR_TEXT_MAX_CHARS) };
}

/**
 * The addition of text blocks to a page that exists: at its end, or right
 * after one of its top-level blocks.
 *
 * Nothing already on the page is changed or removed. The ids of the new
 * blocks are minted at execution, never taken from the model (C235), and the
 * types are the text ones (C233). The card shows every block in full (C232):
 * the arguments are the blocks, verbatim.
 */
export const addBlocks: WriteTool<z.infer<typeof addBlocksArgs>> = {
	name: 'add_blocks',
	description:
		'Ask the user to add text blocks to one of their existing pages: at the end, or right after a top-level block whose text starts with `after` (quote it as read_page shows it). Use it to write into a page; it never changes or removes what is already there.',
	kind: 'write',
	verb: 'Add to a page',
	input: addBlocksArgs,
	async run(ctx, args) {
		const page = await writablePage(ctx, args.pageId);
		if (!page) return { ok: false, error: 'no page with that id in your workspaces' };
		if (Buffer.byteLength(JSON.stringify(args.blocks), 'utf8') > ADD_MAX_BYTES) {
			return { ok: false, error: 'too much text for one change: split it into several additions' };
		}
		const state = await ctx.db.query<{ archived: boolean; blocks: { id: string; content: string }[] }>(
			TOP_BLOCKS_SQL,
			[args.pageId],
		);
		const row = state.rows[0];
		// An archived page is refused here AND by the bridge at execution (C234).
		if (!row || row.archived) return { ok: false, error: 'that page is archived: restore it first' };
		let anchor: { afterBlockId: string; afterBlockText: string } | null = null;
		if (args.after !== undefined) {
			const found = anchorOf(row.blocks, args.after);
			if (!found.ok) return { ok: false, error: found.error };
			anchor = { afterBlockId: found.id, afterBlockText: found.text };
		}
		const target: ApprovalTarget = {
			pageId: String(page.id),
			title: String(page.title ?? ''),
			workspaceId: String(page.workspace_id),
			workspaceName: await workspaceName(ctx.db, String(page.workspace_id)),
		};
		return {
			ok: true,
			data: {
				// The model's `after` is replaced by the block it resolved to: the
				// card shows that block's text, and execution addresses its id.
				args: {
					pageId: args.pageId,
					blocks: args.blocks.map((block) => ({ type: block.type, content: block.content })),
					...(anchor ?? {}),
				},
				target,
				preview: { unit: 'blocks', count: args.blocks.length },
			},
		};
	},
};

/** The write tools, in the order the model sees them. */
export const WRITE_TOOLS: readonly AnyWriteTool[] = Object.freeze([createPage, renamePage, archivePage, addBlocks]);

/** The verb of every write tool, by name: the card says it in plain words. */
export const WRITE_VERBS: Readonly<Record<string, string>> = Object.freeze(
	Object.fromEntries(WRITE_TOOLS.map((tool) => [tool.name, tool.verb])),
);
