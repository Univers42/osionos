/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * "For you" on the bridge: the user's slate of pages, folded into the
 * recommender's champion, and only the pages they may read.
 *
 *   GET  /api/recs/for-you?limit=N   N is clamped 1..20, the default is 10.
 *   POST /api/recs/not-interested   { slate, pageId } — the user's refusal.
 *
 * THE DATA PATH
 *   1. the context of the user (one RPC): the champion, the user's own
 *      vector, the items they touched and the items they refused;
 *   2. the user is FOLDED IN (scripts/bridge-recs-model.mjs) over the items
 *      they touched, with the weights the champion was trained with;
 *   3. the nearest pages of the champion (one RPC), best inner product first;
 *   4. the pages are FILTERED: what the user refused or touched, what is
 *      archived, what they may not read, what they own, what a block hides;
 *   5. the slate is DIVERSIFIED (MMR) and every page carries its "why";
 *   6. the slate is SIGNED, so a later request can prove this list was served.
 *
 * THE OPT-OUT AND THE FALLBACK (C48)
 *   The context answers `{"opted_out": true}` for a user who refused, and
 *   that is the END of the personal path: no nearest read, no history. A user
 *   with no model or no vector gets the same fallback. All three serve the
 *   popular order (bridge-recs-popular.mjs), flagged personalized:false.
 *
 * THE ACL AND THE BLOCKS (C55)
 *   A page reaches the slate only if the caller may read it NOW: the same
 *   rule the feed uses (canReadPageRowAsMember with one membership read), the
 *   caller's own pages are never recommended, and a page whose owner is
 *   hidden from the caller by a block — in EITHER direction — never is.
 *   The "why" is under the same rule: a page the user liked that went private
 *   is never named.
 *
 * THE SIGNED SLATE
 *   bridge-recs-slate.mjs seals it: the refusal route checks it, so a user
 *   may refuse only a page of a list WE issued to THEM (C49).
 */

import { takeToken } from './bridge-ratelimit.mjs';
import { bearerToken, rest, sendJson } from './bridge-social-core.mjs';
import { confidences, explain, foldIn, itemWeights, mmr } from './bridge-recs-model.mjs';
import { limitFrom, readablePages, readPages } from './bridge-recs-pages.mjs';
import { issueSlate } from './bridge-recs-slate.mjs';
import { answerPopular } from './bridge-recs-popular.mjs';
import { NOT_INTERESTED_RATE, answerNotInterested } from './bridge-recs-not-interested.mjs';

/** The two routes of this module. */
const RECS_PATH = '/api/recs/for-you';
const NOT_INTERESTED_PATH = '/api/recs/not-interested';

/** Twenty calls, then one every two seconds: a slate is not a firehose. */
const RATE = { capacity: 20, refillPerSec: 0.5 };

/** How many recent items the context gives, and how many nearest items are asked for. */
const RECENT_LIMIT = 200;
const NEAREST_LIMIT = 200;

/**
 * The flag: the route does not exist until the flag is on. It is exported so
 * the beacon of the recommender (bridge-events.mjs) answers the same 404 —
 * one flag, one meaning, for both routes.
 */
export function recsEnabled(env) {
	return env?.OSIONOS_RECS_FOR_YOU === '1';
}

/** The context of the user: the champion, their vector, their items, their refusals. */
async function readContext(deps, config, userId) {
	const answer = await rest(config, deps.fetchImpl, 'rpc/ai_rec_user_context', {
		method: 'POST',
		body: { p_user: userId, p_recent: RECENT_LIMIT },
	});
	return answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
}

/** The champion's model of the answer, or null when there is none. */
function modelOf(context) {
	const model = context?.model;
	return model && typeof model === 'object' && !Array.isArray(model) ? model : null;
}

/**
 * The user's vector in the champion's space: the fold-in of the items they
 * touched, when the champion carries the gram and the weights it was trained
 * with; the vector it stored for them otherwise.
 */
function userVector(model, recent, stored) {
	const factors = Number(model.factors);
	const gram = model.item_gram;
	const weights = model.event_weights;
	const foldable = Number.isInteger(factors) && factors > 0
		&& Array.isArray(gram) && gram.length === factors * factors
		&& weights && typeof weights === 'object' && !Array.isArray(weights);
	if (foldable) {
		const items = itemWeights(recent, weights);
		if (items.length > 0) {
			const folded = foldIn(gram, factors, items, Number(model.regularization), Number(model.alpha));
			if (folded) {
				return {
					vector: folded.vector,
					chol: folded.chol,
					factors,
					items: confidences(items, Number(model.alpha)),
				};
			}
		}
	}
	const numbers = Array.isArray(stored) ? stored.map(Number) : null;
	if (!numbers || numbers.length === 0 || numbers.some((value) => !Number.isFinite(value))) return null;
	return { vector: Float64Array.from(numbers), chol: null, factors: numbers.length, items: [] };
}

/** The nearest pages of the champion, best inner product first. */
async function readNearest(deps, config, model, vector) {
	const rows = await rest(config, deps.fetchImpl, 'rpc/ai_rec_nearest', {
		method: 'POST',
		body: {
			p_model: model.id,
			p_vector: Array.from(vector, Number),
			p_limit: NEAREST_LIMIT,
			p_kind: 'page',
		},
	});
	return Array.isArray(rows) ? rows : [];
}

/** The strongest own event of an item, and its label. */
function strongestEvent(entry, eventWeights) {
	const labels = [
		{ label: 'liked', events: ['like', 'react'] },
		{ label: 'commented', events: ['comment'] },
		{ label: 'shared', events: ['share'] },
		{ label: 'saved', events: ['favorite'] },
	];
	let best = null;
	for (const { label, events } of labels) {
		for (const name of events) {
			const count = Number(entry?.events?.[name] ?? 0);
			const weight = Number(eventWeights?.[name]);
			if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(weight)) continue;
			if (!best || weight > best.weight || (weight === best.weight && count > best.count)) {
				best = { label, weight, count };
			}
		}
	}
	return best?.label ?? null;
}

/**
 * The "why" of a page: the item of the user's own that explains it best, and
 * only when that item's page is readable NOW (C55 — a liked page that went
 * private is never named). Without an explanation the page is "for you".
 */
function whyFor(folded, model, recent, candidate, readable) {
	if (!folded?.chol || folded.items.length === 0) return { kind: 'for_you' };
	const explained = explain(folded.chol, folded.factors, candidate.vector, folded.items);
	if (!explained) return { kind: 'for_you' };
	const entry = recent.find((row) => String(row?.item_id) === explained && row?.item_kind === 'page');
	if (!entry) return { kind: 'for_you' };
	const row = readable.get(explained);
	if (!row) return { kind: 'for_you' };
	const event = strongestEvent(entry, model.event_weights);
	if (!event) return { kind: 'for_you' };
	return { kind: 'because', pageId: explained, title: row.title ?? null, event };
}

/**
 * The whole answer: the context, the fold-in, the nearest pages, the filter,
 * the diversity and the signature.
 */
async function answerSlate(deps, config, session, url, response) {
	const context = await readContext(deps, config, session.userId);
	// The three exits that cannot personalise serve the popular order (C48).
	// An opted-out user's history is not read: no refused set, nothing.
	if (context?.opted_out === true) return answerPopular(deps, config, session, url, response, 'opted_out', null);
	const model = modelOf(context);
	const recent = Array.isArray(context.recent) ? context.recent : [];
	const refused = new Set(
		(Array.isArray(context.not_interested) ? context.not_interested : [])
			.filter((entry) => entry?.item_kind === 'page')
			.map((entry) => String(entry.item_id)),
	);
	const touched = new Set(
		recent.filter((entry) => entry?.item_kind === 'page').map((entry) => String(entry.item_id)),
	);
	if (!model) return answerPopular(deps, config, session, url, response, 'no_model', refused);
	const folded = userVector(model, recent, context.user_vector);
	if (!folded) return answerPopular(deps, config, session, url, response, 'cold_start', refused);
	const nearest = await readNearest(deps, config, model, folded.vector);
	const wanted = nearest.filter((row) => {
		const id = String(row?.item_id ?? '');
		return row?.item_kind === 'page' && id !== '' && !refused.has(id) && !touched.has(id);
	});
	const rows = await readPages(deps, config, [...wanted.map((row) => String(row.item_id)), ...touched]);
	const readable = await readablePages(deps, config, session, rows);
	const pool = [];
	for (const row of wanted) {
		const id = String(row.item_id);
		const page = readable.get(id);
		if (!page) continue;
		pool.push({ id, ownerId: String(page.owner_id ?? ''), score: Number(row.score) || 0, vector: row.vector });
	}
	const limit = limitFrom(url);
	const chosen = mmr(pool, { limit });
	const items = chosen.map((candidate, index) => {
		const page = readable.get(candidate.id);
		return {
			pageId: candidate.id,
			title: page?.title ?? null,
			icon: page?.icon ?? null,
			workspaceId: page?.workspace_id ?? null,
			rank: index + 1,
			why: whyFor(folded, model, recent, candidate, readable),
		};
	});
	const { recId, slate } = issueSlate(config.appSessionSecret, session.userId, items.map((item) => item.pageId));
	return sendJson(response, 200, {
		ok: true,
		personalized: true,
		modelId: model.id,
		recId,
		slate,
		items,
	}, config);
}

/**
 * Build the /api/recs dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createRecsHandler({ config, verifySession, fetchImpl = fetch, env = process.env, pageAccessFilter = null }) {
	const deps = { fetchImpl, env, pageAccessFilter };
	return async function handleRecsRoute(url, request, response, requestConfig = config) {
		const notInterested = url.pathname === NOT_INTERESTED_PATH;
		if (!notInterested && url.pathname !== RECS_PATH) return false;
		const method = (request.method || 'GET').toUpperCase();
		// The flag off: the route does not exist, exactly like an unknown path —
		// checked BEFORE the session, so a caller without a token cannot tell a
		// disabled recommender (401) from a missing one.
		if (!recsEnabled(deps.env)) return sendJson(response, 404, { ok: false }, requestConfig);
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (notInterested) {
				// Its own bucket, charged BEFORE any read: a refusal is rarer
				// than a slate, and it must not spend the slate's budget.
				takeToken(`recs-ni:${session.userId}`, NOT_INTERESTED_RATE);
				if (method !== 'POST') {
					return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
				}
				return await answerNotInterested(deps, requestConfig, session, request, response);
			}
			// The limit is charged BEFORE any read: a caller must not be able to
			// read the recommender for free, and a burst is the one thing this
			// route must not be.
			takeToken(`recs:${session.userId}`, RATE);
			if (method !== 'GET') {
				return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
			}
			return await answerSlate(deps, requestConfig, session, url, response);
		} catch (error) {
			const status = Number(error?.status);
			if (status === 401 || status === 429) {
				return sendJson(response, status, { ok: false, message: error instanceof Error ? error.message : 'Recs request failed.' }, requestConfig);
			}
			// A backend failure is a 503 and NEVER a partial slate. The message
			// is logged once, and it never carries the caller's token.
			console.warn(`[osionos-bridge] the recs slate failed: ${error instanceof Error ? error.message : 'unknown error'}`);
			return sendJson(response, 503, { ok: false }, requestConfig);
		}
	};
}
