/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-popular.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 13:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 13:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The popular order: what "For you" serves when it cannot personalise (devil
 * C48) — the user opted out, there is no trained model, or the user is new.
 *
 * ai_rec_popular ranks pages by DISTINCT users with a positive explicit event
 * (C50), so the order carries nobody's own history. The pages then pass the
 * rule of the personal slate (C55): readable NOW, never the caller's own, never
 * a blocked owner's. There is no MMR: popular rows carry no vector, and the
 * order is the signal.
 *
 * OPTED OUT: the request names no user data. The only inputs are the limit
 * and the session (for the ACL); no refused set is read from events, because
 * an opted-out user's history is not read.
 *
 * A database without the function (404 PGRST202) answers the old empty shape,
 * logged once.
 *
 * Caveat: a popular page the viewer cannot read is dropped after the RPC, so
 * a small workspace may get fewer than `limit` items, or none.
 */

import { rest, sendJson } from './bridge-social-core.mjs';
import { limitFrom, readablePages, readPages } from './bridge-recs-pages.mjs';
import { issueSlate } from './bridge-recs-slate.mjs';

/** How many popular rows are asked for: room for the ACL filter to drop some. */
const POPULAR_ASK = 100;

let missingLogged = false;

/** The answer of a user the recommender cannot serve and the popular order cannot either. */
export function notPersonalized(response, config, reason) {
	return sendJson(response, 200, { ok: true, personalized: false, reason, items: [] }, config);
}

/** The popular page ids, best first, or null when the database lacks the function. */
async function readPopular(deps, config) {
	try {
		const rows = await rest(config, deps.fetchImpl, 'rpc/ai_rec_popular', {
			method: 'POST',
			body: { p_limit: POPULAR_ASK },
		});
		return (Array.isArray(rows) ? rows : []).map((row) => String(row?.item_id ?? '')).filter(Boolean);
	} catch (error) {
		if (Number(error?.status) !== 404) throw error;
		if (!missingLogged) {
			missingLogged = true;
			console.warn('[osionos-bridge] ai_rec_popular is missing on this database: "For you" stays empty when it cannot personalise.');
		}
		return null;
	}
}

/**
 * Answer a request the recommender cannot personalise with the popular order.
 *
 * @param {Set<string>|null} refused page ids the user refused, when the context gave them
 */
export async function answerPopular(deps, config, session, url, response, reason, refused) {
	const ids = await readPopular(deps, config);
	const wanted = (ids ?? []).filter((id) => !refused?.has(id));
	if (wanted.length === 0) return notPersonalized(response, config, reason);
	const readable = await readablePages(deps, config, session, await readPages(deps, config, wanted));
	const items = wanted
		.filter((id) => readable.has(id))
		.slice(0, limitFrom(url))
		.map((id, index) => {
			const page = readable.get(id);
			return {
				pageId: id,
				title: page.title ?? null,
				icon: page.icon ?? null,
				workspaceId: page.workspace_id ?? null,
				rank: index + 1,
				why: { kind: 'popular' },
			};
		});
	if (items.length === 0) return notPersonalized(response, config, reason);
	const { recId, slate } = issueSlate(config.appSessionSecret, session.userId, items.map((item) => item.pageId));
	return sendJson(response, 200, { ok: true, personalized: false, reason, recId, slate, items }, config);
}
