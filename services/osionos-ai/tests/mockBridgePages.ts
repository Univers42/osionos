import type { ServerResponse } from 'node:http';

/** A page the mock bridge holds for the undo tests: no version is the bridge's page that never had one. */
export interface MockPage {
	version: number | null;
	content: unknown[];
	title: string;
	archivedAt: string | null;
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { 'content-type': 'application/json' });
	response.end(JSON.stringify(body));
}

/**
 * A Postgres JSONB column returns object keys shorter first, then bytewise: the
 * page the bridge reads back is not byte-identical to the blocks that were sent.
 */
function jsonbOrder(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(jsonbOrder);
	if (value === null || typeof value !== 'object') return value;
	const keys = Object.keys(value).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
	return Object.fromEntries(keys.map((key) => [key, jsonbOrder((value as Record<string, unknown>)[key])]));
}

/**
 * The body of GET /api/pages/<id> for a seeded page: the shape of the bridge's pageRowToEntry
 * (scripts/bridge-api.mjs): `_id`, an empty title reads 'Untitled', and contentVersion is
 * absent while the page has no version.
 */
export function seededPageBody(pageId: string, page: MockPage): Record<string, unknown> {
	return {
		_id: pageId,
		title: page.title ? page.title : 'Untitled',
		content: jsonbOrder(page.content),
		archivedAt: page.archivedAt,
		...(page.version === null ? {} : { contentVersion: page.version }),
	};
}

/** Applies a page PATCH to a seeded page; false when its baseVersion is not the stored one (a 409). */
export function applyPagePatch(page: MockPage | undefined, body: unknown): boolean {
	if (!page) return true;
	const patch = body as { baseVersion?: unknown; content?: unknown; title?: unknown; archivedAt?: unknown };
	if (patch.baseVersion !== undefined && patch.baseVersion !== page.version) return false;
	if (Array.isArray(patch.content)) page.content = patch.content;
	if (typeof patch.title === 'string') page.title = patch.title;
	if (typeof patch.archivedAt === 'string') page.archivedAt = patch.archivedAt;
	if (page.version !== null) page.version += 1;
	return true;
}

/**
 * The page PATCHes whose answer is lost (`dropNextPatchAnswers`): 'before' destroys the
 * connection before the write is applied, 'after' once it is.
 */
export function patchDrops() {
	let count = 0;
	let applies = true;
	return {
		arm(n: number, apply: boolean): void {
			count = n;
			applies = apply;
		},
		reset(): void {
			count = 0;
		},
		take(): 'none' | 'before' | 'after' {
			if (count === 0) return 'none';
			count--;
			return applies ? 'after' : 'before';
		},
	};
}
