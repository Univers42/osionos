// POST /api/pages/from-markdown (osionos#240): one private page from a markdown document,
// converted by the editor's own import (markdownImportBlocks, bundled from the client source)
// so the API and the editor never disagree on a document (ruling M240-10).
// The engine's regexes are the event-loop risk (ruling F2), so every bound runs before the
// parse: the rate limit before the body is read, the 64 KiB markdown cap before authorization.
// Authorization, the row and the insert are bridge-api's own (M240-6): injected, not re-written.

import { Buffer } from 'node:buffer';
import { readRawBody } from './bridge-chat-media.mjs';
import { markdownImportBlocks } from './bridge-markdown-engine.mjs';
import { patWritePayload } from './bridge-pat-middleware.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { bearerToken, httpError, safeText } from './bridge-social-core.mjs';
import { verifyAppSessionToken } from './bridge-session-token.mjs';

export const FROM_MARKDOWN_PATH = '/api/pages/from-markdown';
export const MARKDOWN_MAX_BYTES = 64 * 1024;
// The markdown plus a title and two ids, JSON-escaped (a 64 KiB document of control
// characters escapes to about 6x), stays under this.
export const BODY_MAX_BYTES = 512 * 1024;
// UTF-16 units, the unit safeText slices by: a title the store would truncate is refused.
export const TITLE_MAX_UNITS = 200;
// Caveat: per bridge process and per user, sessions and PATs alike; N bridge processes
// allow N times the rate, and a restart refills every bucket.
export const FROM_MARKDOWN_LIMIT = { capacity: 20, refillPerSec: 1 / 3 };

const badRequest = (message) => httpError(message, 400);

/** The 429 as errorJson answers it: takeToken's retryAfterSec becomes the Retry-After header. */
function spendToken(userId) {
	try {
		takeToken(`pages-from-markdown:${userId}`, FROM_MARKDOWN_LIMIT);
	} catch (error) {
		if (Number.isFinite(error?.retryAfterSec)) error.retryAfterSeconds = error.retryAfterSec;
		throw error;
	}
}

/** The JSON object the body holds, counted in bytes; a PAT's write is held to its mask. */
async function readPayload(request) {
	const raw = await readRawBody(request, BODY_MAX_BYTES);
	let payload;
	try {
		payload = JSON.parse(raw.toString('utf8') || '{}');
	} catch {
		throw badRequest('The request body must be JSON.');
	}
	if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw badRequest('The request body must be a JSON object.');
	return request.patWriteMask ? patWritePayload(payload, request.patWriteMask) : payload;
}

/** The markdown and the stored title, or the 413/400 that refuses them before any parse. */
function requireFields(payload) {
	const { markdown, title } = payload;
	if (typeof markdown !== 'string') throw badRequest('markdown must be a string.');
	if (Buffer.byteLength(markdown, 'utf8') > MARKDOWN_MAX_BYTES) throw httpError('markdown is over 64 KiB.', 413);
	if (title !== undefined && title !== null && typeof title !== 'string') throw badRequest('title must be a string.');
	const storedTitle = safeText(title, Number.POSITIVE_INFINITY);
	if (storedTitle.length > TITLE_MAX_UNITS) throw badRequest(`title is over ${TITLE_MAX_UNITS} characters.`);
	return { markdown, title: storedTitle };
}

/** The blocks, or a 422: a parser exception never reaches the process (M240-9). */
function convert(parse, markdown) {
	try {
		return parse(markdown);
	} catch {
		throw httpError('The markdown could not be converted.', 422);
	}
}

/**
 * The route. `deps` are bridge-api's: authorizePageCreate (workspace `create`, then the
 * parent), rowFromPayload (pageCreateRowFromPayload: private, the caller's, content
 * validated), insertPage (the edge-capped POST), pageVersionOf and json. `parse` is
 * injectable so a test can make it throw.
 */
export function createFromMarkdownRoute({ authorizePageCreate, rowFromPayload, insertPage, pageVersionOf, json, parse = markdownImportBlocks }) {
	return async function handleFromMarkdown(url, request, response, config, fetchImpl) {
		if (url.pathname !== FROM_MARKDOWN_PATH) return false;
		const { userId } = verifyAppSessionToken(bearerToken(request), config);
		spendToken(userId);
		const payload = await readPayload(request);
		const { markdown, title } = requireFields(payload);
		const authContext = await authorizePageCreate(request, payload, config, fetchImpl);
		const content = convert(parse, markdown);
		const row = rowFromPayload({ workspaceId: payload.workspaceId, parentPageId: payload.parentPageId, title, content }, authContext);
		const rows = await insertPage(config, fetchImpl, row);
		const stored = (Array.isArray(rows) ? rows[0] : rows) ?? {};
		const version = pageVersionOf(stored);
		const reply = { id: stored.id, title: stored.title ?? row.title, blockCount: row.content.length };
		json(response, 201, version === null ? reply : { ...reply, version }, config);
		return true;
	};
}
