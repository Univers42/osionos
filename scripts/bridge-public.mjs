/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-public.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Public page publishing (`/api/pages/:id/publish`, `/api/public/pages/:token`).
 * Publishing SNAPSHOT-copies a page's content into osionos_published_pages; the
 * unauthenticated public GET reads ONLY that snapshot table (never live pages),
 * rate-limited per IP. Owner-only publish/unpublish. The whole feature 404s unless
 * OSIONOS_PUBLISH_ENABLED=1, so it is inert by default (unauthenticated surface).
 *
 * L0 runs BEFORE a page is published (bridge-moderation-gate.mjs): the page's
 * title and its text are checked, and a warning is the author's question (409)
 * — the page stays private until they answer it with acknowledgeWarning: true.
 * WARN-ONLY: osionos_published_pages has no moderation_state column, so
 * nothing is ever written held and no audit row is ever written.
 */

import { bearerToken, moderationWarningBody, readJsonBody, rest, sendJson } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { clientAddress } from './bridge-guard.mjs';
import { pagePublishText } from './bridge-page-text.mjs';
import { publishSnapshot } from './bridge-publish-snapshot.mjs';
import { askBeforeWrite } from './bridge-moderation-gate.mjs';

const PUBLISH_PATH = /^\/api\/pages\/([0-9a-fA-F-]{36})\/publish$/;
const PUBLIC_PATH = /^\/api\/public\/pages\/([0-9a-f]{32})$/;

const PUBLIC_CACHE_HEADERS = { 'cache-control': 'public, max-age=60' };
const NO_STORE_HEADERS = { 'cache-control': 'no-store' };

async function publish(deps, session, request, pageId, response, config) {
	const { row } = await deps.verifyPageAccess(request, pageId, 'update');
	if (row.owner_id !== session.userId) return sendJson(response, 403, { ok: false, message: 'Only the owner can publish.' }, config);
	// L0 asks BEFORE the page goes public: its title and its text are the words
	// that are checked, and a warning is the author's question (409) — the page
	// stays private until they answer it.
	const payload = await readJsonBody(request).catch(() => ({}));
	const decision = askBeforeWrite({ text: pagePublishText(row), surface: 'publish', env: deps.env, payload });
	if (decision.outcome === 'needs_ack') return sendJson(response, 409, moderationWarningBody(decision), config);
	const rows = await rest(config, deps.fetchImpl, 'osionos_published_pages?on_conflict=page_id', {
		method: 'POST',
		body: {
			page_id: pageId, owner_id: session.userId,
			title: row.title || 'Untitled', icon: row.icon ?? null,
			content: publishSnapshot(row.content), published_at: new Date().toISOString(),
		},
		prefer: 'resolution=merge-duplicates,return=representation',
	});
	const token = Array.isArray(rows) && rows[0]?.token ? rows[0].token : null;
	return sendJson(response, 200, { ok: true, token }, config);
}

async function unpublish(deps, session, request, pageId, response, config) {
	const { row } = await deps.verifyPageAccess(request, pageId, 'update');
	if (row.owner_id !== session.userId) return sendJson(response, 403, { ok: false, message: 'Only the owner can unpublish.' }, config);
	await rest(config, deps.fetchImpl, `osionos_published_pages?page_id=eq.${pageId}`, { method: 'DELETE', prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true }, config);
}

async function publicRead(deps, request, token, response, config) {
	// The bucket follows the proxy-derived address, never the caller's header
	// entries: rotating X-Forwarded-For must not buy a fresh bucket. The handler's
	// own config is the fallback so a per-request config cannot silently drop it.
	const ipHeader = config.clientIpHeader ?? deps.config.clientIpHeader;
	takeToken(`pub:${clientAddress(request, { ipHeader }) ?? 'anon'}`, { capacity: 30, refillPerSec: 0.5 }); // throws 429
	const rows = await rest(config, deps.fetchImpl, `osionos_published_pages?token=eq.${token}&select=title,icon,content,published_at`);
	const page = Array.isArray(rows) && rows[0];
	if (!page) return sendJson(response, 404, { ok: false, message: 'This page is not published.' }, config, NO_STORE_HEADERS);
	return sendJson(response, 200, {
		ok: true, title: page.title, icon: page.icon ?? null,
		content: Array.isArray(page.content) ? page.content : [], publishedAt: page.published_at,
	}, config, PUBLIC_CACHE_HEADERS);
}

/** Build the publish/public dispatcher. deps: { config, verifySession, verifyPageAccess, fetchImpl?, env? }. */
export function createPublicHandler({ config, verifySession, verifyPageAccess, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, verifyPageAccess, env, config };
	return async function handlePublicRoute(url, request, response, requestConfig = config) {
		const publicMatch = PUBLIC_PATH.exec(url.pathname);
		const publishMatch = PUBLISH_PATH.exec(url.pathname);
		if (!publicMatch && !publishMatch) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			if (env.OSIONOS_PUBLISH_ENABLED !== '1') return sendJson(response, 404, { ok: false, message: 'Not found.' }, requestConfig);
			if (publicMatch && method === 'GET') return await publicRead(deps, request, publicMatch[1], response, requestConfig);
			if (publishMatch) {
				const session = verifySession(bearerToken(request), requestConfig);
				if (method === 'POST') return await publish(deps, session, request, publishMatch[1], response, requestConfig);
				if (method === 'DELETE') return await unpublish(deps, session, request, publishMatch[1], response, requestConfig);
			}
			return sendJson(response, 404, { ok: false, message: 'Public route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Publish request failed.' }, requestConfig);
		}
	};
}
