/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-fanout.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { publishRealtime } from './bridge-social-core.mjs';

function collaboratorIds(list) {
	const ids = new Map();
	for (const entry of Array.isArray(list) ? list : []) {
		if (entry && typeof entry.userId === 'string') ids.set(entry.userId.toLowerCase(), entry.userId);
	}
	return ids;
}

/** Users added to and removed from a page's collaborators by one write. Case-insensitive ids. */
export function collaboratorDiff(before, after) {
	const was = collaboratorIds(before);
	const now = collaboratorIds(after);
	return {
		granted: [...now].filter(([key]) => !was.has(key)).map(([, id]) => id),
		revoked: [...was].filter(([key]) => !now.has(key)).map(([, id]) => id),
	};
}

/**
 * Tells each user a committed sharing write added or removed that their access to the page
 * changed, on their own `user:` topic. Ids only: a revoked user learns nothing new.
 * Caveat: only the collaborators list fans out; a visibility change (private → workspace) or a
 * share rule reaches nobody until their next page-list read.
 */
export async function publishPageAccess({ workspaceId, pageId, before, after, fetchImpl }) {
	const { granted, revoked } = collaboratorDiff(before, after);
	const publish = (userId, op) => publishRealtime({
		topic: `user:${userId}`,
		eventType: 'page_access',
		payload: { workspaceId, pageId, op },
		fetchImpl,
	});
	await Promise.all([...granted.map((id) => publish(id, 'granted')), ...revoked.map((id) => publish(id, 'revoked'))]);
}
