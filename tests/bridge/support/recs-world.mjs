/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recs-world.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 13:50:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 13:50:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The world of the "For you" tests: the caller, nine pages each there for a
 * reason (readable, private elsewhere, archived, blocked, refused, the
 * caller's own, already touched), and the builders of a wide world.
 */

import { MODEL, uid } from './recs-postgrest.mjs';

/** Every test uses its own caller: the rate limit is per user, and it is shared. */
let counter = 900;
export const user = () => uid(++counter);

export const OTHER = uid(12);
export const BLOCKER = uid(13);
export const WS = 'aaaaaaaa-0000-4000-8000-000000000001';
export const WS_OTHER = 'aaaaaaaa-0000-4000-8000-000000000002';
export const LIKED = uid(21);
export const COMMENTED = uid(22);
export const TOUCHED = uid(23);
export const NEAR = uid(31);
export const PRIVATE = uid(32);
export const ARCHIVED = uid(33);
export const BLOCKED = uid(34);
export const REFUSED = uid(35);
export const MINE = uid(36);

export function page(id, { workspace = WS, owner = OTHER, visibility = 'shared', title = 'A page', archived = null } = {}) {
	return {
		id,
		title,
		icon: null,
		workspace_id: workspace,
		owner_id: owner,
		visibility,
		collaborators: [],
		archived_at: archived,
	};
}

/** The context of the caller: the champion, the items they touched, the one they refused. */
export function context(extra = {}) {
	return {
		model: MODEL,
		user_vector: null,
		recent: [
			{ item_kind: 'page', item_id: LIKED, events: { like: 2 }, vector: [1, 0] },
			{ item_kind: 'page', item_id: COMMENTED, events: { comment: 1 }, vector: [0, 1] },
			{ item_kind: 'page', item_id: TOUCHED, events: { like: 1 }, vector: [0.2, 0.1] },
		],
		not_interested: [{ item_kind: 'page', item_id: REFUSED }],
		...extra,
	};
}

/** The nearest pages of the champion, best inner product first. */
export function nearestRow(id, score) {
	return { item_kind: 'page', item_id: id, workspace_id: WS, score, vector: [1, score / 100] };
}

/** The world of the caller: nine pages, one of them each for a reason. */
export function world(extra = {}, me = user()) {
	return {
		context: context(),
		nearest: [
			nearestRow(NEAR, 10),
			nearestRow(PRIVATE, 9),
			nearestRow(ARCHIVED, 8),
			nearestRow(BLOCKED, 7),
			nearestRow(REFUSED, 6),
			nearestRow(MINE, 5),
			nearestRow(TOUCHED, 4),
		],
		pages: [
			page(LIKED, { title: 'The liked page' }),
			page(COMMENTED, { title: 'The commented page' }),
			page(TOUCHED, { title: 'The touched page' }),
			page(NEAR, { title: 'The near page' }),
			page(PRIVATE, { workspace: WS_OTHER, visibility: 'private', title: 'The private page' }),
			page(ARCHIVED, { archived: '2026-01-01T00:00:00.000Z', title: 'The archived page' }),
			page(BLOCKED, { owner: BLOCKER, title: 'The blocked page' }),
			page(REFUSED, { title: 'The refused page' }),
			page(MINE, { owner: me, title: 'My own page' }),
		],
		members: [{ user_id: me, workspace_id: WS }],
		blocks: [{ blocker_id: me, blocked_id: BLOCKER }],
		...extra,
	};
}

/** The page ids of an answer. */
export const pageIds = (answer) => answer.body.items.map((item) => item.pageId);

/** A world with many readable pages, each of its own author, so the limit shows. */
export function wideWorld(count, me = user()) {
	const ids = Array.from({ length: count }, (_unused, index) => uid(400 + index));
	return world({
		nearest: ids.map((id, index) => nearestRow(id, 100 - index)),
		pages: ids.map((id, index) => page(id, { title: `Page ${index}`, owner: uid(500 + index) })),
	}, me);
}
