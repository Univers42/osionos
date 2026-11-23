import type { ApprovalRow } from '../approvals/types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page a write touches: the page itself, or the parent a new page goes under. */
export interface WriteTarget {
	pageId: string;
	kind: 'page' | 'parent';
}

const ARG_BY_TOOL: Record<string, { key: string; kind: WriteTarget['kind'] }> = {
	add_blocks: { key: 'pageId', kind: 'page' },
	rename_page: { key: 'pageId', kind: 'page' },
	create_page: { key: 'parentPageId', kind: 'parent' },
};

/**
 * The page an auto mode must place in the workspace and the anchor subtree.
 * A create_page without a parent (a root page) has no target: the caller cards
 * it as no_anchor.
 *
 * Caveat: only add_blocks, rename_page and create_page are known. Any other
 * tool, or args that do not carry a uuid, give null, which over-cards (fail
 * closed); a new write tool must be added here before an auto mode can run it.
 */
export function targetOf(row: ApprovalRow): WriteTarget | null {
	const spec = Object.hasOwn(ARG_BY_TOOL, row.tool) ? ARG_BY_TOOL[row.tool] : undefined;
	const value = spec ? row.args?.[spec.key] : undefined;
	return spec && typeof value === 'string' && UUID.test(value) ? { pageId: value.toLowerCase(), kind: spec.kind } : null;
}
