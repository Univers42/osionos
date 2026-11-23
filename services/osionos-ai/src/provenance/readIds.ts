export type ReadContent =
	| { pageIds: string[] }
	| { skill: { source: 'builtin' | 'workspace' | 'user'; slug: string } }
	| 'none'
	| 'untrusted';

const NO_CONTENT: ReadonlySet<string> = new Set(['open_page', 'open_panel', 'open_issue_report', 'suggest_agent', 'remember']);

function field(data: unknown, key: string): unknown {
	return data !== null && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
}

function idsOf(items: unknown, keys: readonly string[]): string[] | null {
	if (!Array.isArray(items)) return null;
	const ids: string[] = [];
	for (const item of items) {
		for (const key of keys) {
			const value = field(item, key);
			if (typeof value === 'string') ids.push(value);
			else if (value !== null && value !== undefined) return null;
		}
	}
	return ids;
}

function pages(ids: string[] | null): ReadContent {
	return ids ? { pageIds: ids } : 'untrusted';
}

function readSkill(data: unknown): ReadContent {
	const source = field(data, 'source');
	const slug = field(data, 'id');
	if ((source === 'builtin' || source === 'workspace' || source === 'user') && typeof slug === 'string') return { skill: { source, slug } };
	return 'untrusted';
}

/**
 * Which content of a tool result the user did not necessarily write.
 *
 * Fail closed: an unknown tool, or a known one whose data has not the shape
 * expected, is 'untrusted'. Graph nodes count with their via page too.
 *
 * Caveat: this trusts the shape of each tool's `data`. A tool that later adds
 * content from another field without updating this function under-reports; the
 * unknown-tool fallback only catches new tools, not new fields.
 */
export function readContent(tool: string, data: unknown): ReadContent {
	if (NO_CONTENT.has(tool) || tool.startsWith('web_') || tool.startsWith('mcp_')) return 'none';
	if (tool === 'search_workspace') return pages(idsOf(field(data, 'chunks'), ['pageId']));
	if (tool === 'graph_neighbors') return pages(idsOf(field(data, 'nodes'), ['pageId', 'via']));
	if (tool === 'read_page') return typeof field(data, 'pageId') === 'string' ? { pageIds: [field(data, 'pageId') as string] } : 'untrusted';
	if (tool === 'load_skill') return readSkill(data);
	return 'untrusted';
}
