/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chat-threads.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Thread fetch (`GET /api/chat/threads/:rootId`): the root + all its replies
 * (flat, by thread_root_id), fully hydrated. Thread access == channel access
 * (requireChannelAccess on the root's channel). `requireChannelAccess` and
 * `messageEntry` are injected by bridge-chat so the membership gate + the entry
 * shape stay defined in one place.
 */

import { httpError, identitySummaries, rest, sendJson } from './bridge-social-core.mjs';
import { attachmentEntry } from './bridge-chat-media.mjs';

export async function getThread(deps, session, rootId, response, config, { requireChannelAccess, messageEntry }) {
	const rootRows = await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${rootId}&select=*&limit=1`);
	const root = Array.isArray(rootRows) ? rootRows[0] : null;
	if (!root || root.deleted_at) throw httpError('Thread not found.', 404);
	await requireChannelAccess(config, deps.fetchImpl, session.userId, root.channel_id);

	const rows = await rest(config, deps.fetchImpl,
		`osionos_messages?or=(id.eq.${rootId},thread_root_id.eq.${rootId})&deleted_at=is.null&select=*&order=created_at.asc`);
	const ordered = Array.isArray(rows) ? rows : [];
	const messageIds = ordered.map((r) => r.id);
	let reactionsByMessage = new Map();
	let attachmentsByMessage = new Map();
	let mentionsByMessage = new Map();
	if (messageIds.length > 0) {
		const reactionRows = await rest(config, deps.fetchImpl, `osionos_message_reactions?message_id=in.(${messageIds.join(',')})&select=message_id,user_id,emoji`);
		reactionsByMessage = Map.groupBy(Array.isArray(reactionRows) ? reactionRows : [], (r) => r.message_id);
		const attachRows = await rest(config, deps.fetchImpl, `osionos_message_attachments?message_id=in.(${messageIds.join(',')})&select=*&order=created_at.asc`);
		attachmentsByMessage = Map.groupBy(Array.isArray(attachRows) ? attachRows : [], (r) => r.message_id);
		const mentionRows = await rest(config, deps.fetchImpl, `osionos_message_mentions?message_id=in.(${messageIds.join(',')})&select=message_id,user_id`);
		mentionsByMessage = Map.groupBy(Array.isArray(mentionRows) ? mentionRows : [], (r) => r.message_id);
	}
	const identities = await identitySummaries(config, deps.fetchImpl, ordered.map((r) => r.author_id));
	const messages = ordered.map((r) => messageEntry(
		r,
		identities.get(r.author_id),
		(reactionsByMessage.get(r.id) ?? []).map((x) => ({ userId: x.user_id, emoji: x.emoji })),
		attachmentsByMessage.has(r.id) ? (attachmentsByMessage.get(r.id) ?? []).map(attachmentEntry) : null,
		null,
		(mentionsByMessage.get(r.id) ?? []).map((x) => x.user_id),
	));
	return sendJson(response, 200, { ok: true, channelId: root.channel_id, rootId, messages }, config);
}
