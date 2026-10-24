/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-baas-body.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One home for the rule every BaaS reader shares for an answer the caller already
 * knows is 2xx: a body that cannot be read, or one that is not JSON, is a broken
 * read. Each caller answers "no rows" through its own `empty`, and an access
 * decision or a list answered from that is a decision taken on missing data.
 *
 * The caller passes `fail`, the factory of its own error, so every reader keeps its
 * own error shape and level here (an Error carrying { status: 502 }, or
 * httpError(message, 502)); this module only decides which outcome a body gets and
 * words the message. A non-2xx stays with the caller: each reader maps that status
 * itself, and several need the body text to map it.
 *
 * It also owns the one BaaS call budget, because bridge-api.mjs and bridge-social-core.mjs
 * both import this leaf and social-core must never import bridge-api.mjs.
 */
export async function readBaasJson(response, { service, empty, fail }) {
	let readFailed = false;
	const text = await response.text().catch(() => { readFailed = true; return ''; });
	if (readFailed) throw fail(`BaaS response body could not be read (${service}).`);
	// Ponytail: a body-less 2xx answers `empty`, so a genuinely empty answer and one
	// lost after the headers are the same here — the lost one reads as "no rows",
	// never as a broken read.
	if (!text) return empty;
	try {
		return JSON.parse(text);
	} catch {
		throw fail(`BaaS response body was not valid JSON (${Buffer.byteLength(text)} bytes).`);
	}
}

// Caveat: sized for a cold TLS relay + Tailscale Funnel hop, not for a healthy link. Measured live
// 2026-10-18: the first 2 of 12 REST calls after idle took 3743 ms and 3501 ms, the rest 199-734 ms,
// so the old 2_500 aborted every cold call. The cost: a dead BaaS now takes up to 8 s to fail each call.
export const BAAS_FETCH_TIMEOUT_MS = 8_000;
