/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chat-search.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Full-text message search (`GET /api/chat/search`). The result set is ALWAYS
 * constrained to the caller's accessible channels (member channels ∪ public
 * workspace channels) or a single channel that passed requireChannelAccess —
 * an empty accessible set returns []. Never an unscoped query: security here
 * depends on the bridge (service role) injecting the channel filter, not RLS.
 * `accessibleChannelIds` + `requireChannelAccess` are injected by bridge-chat.
 */

import { UUID_REGEX, identitySummaries, rest, safeText, sendJson } from './bridge-social-core.mjs';

const MAX_HITS = 50;

/** A ~80-char window around the first query token (best-effort highlight source). */
function snippet(content, query) {
	const text = String(content ?? '');
	const needle = (query.toLowerCase().split(/\s+/)[0] ?? '');
	const at = needle ? text.toLowerCase().indexOf(needle) : -1;
	if (at < 0) return safeText(text.slice(0, 80), 80);
	const start = Math.max(0, at - 30);
	return (start > 0 ? '…' : '') + safeText(text.slice(start, start + 80), 80);
}

export async function searchMessages(deps, session, url, response, config, { accessibleChannelIds, requireChannelAccess }) {
	const query = safeText(url.searchParams.get('q'), 120).trim();
	if (!query) return sendJson(response, 200, { ok: true, hits: [] }, config);
	const limit = Math.min(Math.max(Math.trunc(Number(url.searchParams.get('limit')) || 20), 1), MAX_HITS);
	const channelParam = safeText(url.searchParams.get('channelId'), 80);

	let ids;
	if (channelParam && UUID_REGEX.test(channelParam)) {
		await requireChannelAccess(config, deps.fetchImpl, session.userId, channelParam); // 403 if not a member
		ids = [channelParam];
	} else {
		ids = await accessibleChannelIds(deps, config, session.userId);
	}
	if (ids.length === 0) return sendJson(response, 200, { ok: true, hits: [] }, config);

	const rows = await rest(config, deps.fetchImpl,
		`osionos_messages?channel_id=in.(${ids.join(',')})&deleted_at=is.null&search_doc=wfts(english).${encodeURIComponent(query)}&select=id,channel_id,author_id,content,created_at&order=created_at.desc&limit=${limit}`);
	const list = Array.isArray(rows) ? rows : [];
	const identities = await identitySummaries(config, deps.fetchImpl, list.map((r) => r.author_id));
	let channelMeta = new Map();
	const channelIds = [...new Set(list.map((r) => r.channel_id))];
	if (channelIds.length > 0) {
		const chRows = await rest(config, deps.fetchImpl, `osionos_channels?id=in.(${channelIds.join(',')})&select=id,name,workspace_id`);
		channelMeta = new Map((Array.isArray(chRows) ? chRows : []).map((c) => [c.id, c]));
	}
	const hits = list.map((r) => ({
		messageId: r.id, channelId: r.channel_id,
		channelName: channelMeta.get(r.channel_id)?.name ?? 'channel',
		workspaceId: channelMeta.get(r.channel_id)?.workspace_id ?? null,
		authorName: identities.get(r.author_id)?.name ?? 'Member',
		snippet: snippet(r.content, query), createdAt: r.created_at,
	}));
	return sendJson(response, 200, { ok: true, hits }, config);
}
