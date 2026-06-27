/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-notify.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Notification inbox routes (`/api/notifications/*`) — list / mark-read /
 * mark-all / inbox-bootstrap. Every query is scoped to session.userId (RLS is
 * own-row on top). `inbox` hands the client its unguessable `notify_token` so it
 * can subscribe to its per-user realtime topic `user:<token>`. Notifications are
 * WRITTEN by emitNotifications (bridge-social-core) from the chat plane.
 */

import { UUID_REGEX, bearerToken, httpError, readJsonBody, rest, sendJson } from './bridge-social-core.mjs';

function notificationEntry(row) {
	return {
		id: row.id, type: row.type, actorId: row.actor_id ?? null,
		channelId: row.channel_id ?? null, messageId: row.message_id ?? null,
		preview: row.preview ?? null, readAt: row.read_at ?? null, createdAt: row.created_at,
	};
}

async function listNotifications(deps, session, url, response, config) {
	const limit = Math.min(Math.max(Math.trunc(Number(url.searchParams.get('limit')) || 30), 1), 100);
	let path = `osionos_notifications?user_id=eq.${session.userId}&select=*&order=created_at.desc&limit=${limit}`;
	if (url.searchParams.get('unread') === '1') path += '&read_at=is.null';
	const rows = await rest(config, deps.fetchImpl, path);
	return sendJson(response, 200, { ok: true, items: (Array.isArray(rows) ? rows : []).map(notificationEntry) }, config);
}

async function notificationsInbox(deps, session, response, config) {
	const idRows = await rest(config, deps.fetchImpl, `osionos_bridge_identities?user_id=eq.${session.userId}&select=notify_token&limit=1`);
	const notifyToken = Array.isArray(idRows) && idRows[0]?.notify_token ? idRows[0].notify_token : null;
	const unreadRows = await rest(config, deps.fetchImpl, `osionos_notifications?user_id=eq.${session.userId}&read_at=is.null&select=id`);
	return sendJson(response, 200, { ok: true, notifyToken, unread: Array.isArray(unreadRows) ? unreadRows.length : 0 }, config);
}

async function markRead(deps, session, request, response, config, all) {
	let path = `osionos_notifications?user_id=eq.${session.userId}&read_at=is.null`;
	if (!all) {
		const payload = await readJsonBody(request).catch(() => ({}));
		const valid = (Array.isArray(payload?.ids) ? payload.ids : []).filter((id) => UUID_REGEX.test(String(id)));
		if (valid.length === 0) return sendJson(response, 200, { ok: true }, config);
		path += `&id=in.(${valid.join(',')})`;
	}
	await rest(config, deps.fetchImpl, path, { method: 'PATCH', body: { read_at: new Date().toISOString() }, prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true }, config);
}

/** Build the /api/notifications dispatcher. deps: { config, verifySession, fetchImpl?, env? }. */
export function createNotifyHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleNotifyRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		if (!pathname.startsWith('/api/notifications')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (pathname === '/api/notifications' && method === 'GET') return await listNotifications(deps, session, url, response, requestConfig);
			if (pathname === '/api/notifications/inbox' && method === 'GET') return await notificationsInbox(deps, session, response, requestConfig);
			if (pathname === '/api/notifications/read' && method === 'POST') return await markRead(deps, session, request, response, requestConfig, false);
			if (pathname === '/api/notifications/read-all' && method === 'POST') return await markRead(deps, session, request, response, requestConfig, true);
			return sendJson(response, 404, { ok: false, message: 'Notification route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Notification request failed.' }, requestConfig);
		}
	};
}
