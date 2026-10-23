/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-embed.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/embed/resolve {url} -> 200 {ok:true, embed: EmbedInfo}
 *
 * Session required (401 before any outbound connection), charged to the
 * `unfurl:<userId>` rate bucket. The SSRF guard, parsing and cache live in the
 * bridge-unfurl modules; this file is only the route.
 */

import { bearerToken, httpError, readJsonBody, sendJson } from './bridge-social-core.mjs';
import { admitUnfurl, defaultUnfurler } from './bridge-unfurl-core.mjs';

const ROUTE = '/api/embed/resolve';

// Unexpected failures never echo their message: it could carry a socket errno or an upstream detail.
function errorBody(error) {
	return error?.status ? error.message : 'Embed request failed.';
}

export function createEmbedHandler({ config, verifySession, unfurler = defaultUnfurler }) {
	return async function handleEmbedRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== ROUTE) return false;
		try {
			if ((request.method || 'GET').toUpperCase() !== 'POST') throw httpError('Method not allowed.', 405);
			const session = verifySession(bearerToken(request), requestConfig);
			const payload = await readJsonBody(request);
			admitUnfurl(session.userId);
			const embed = await unfurler.resolve(typeof payload?.url === 'string' ? payload.url : '');
			return sendJson(response, 200, { ok: true, embed }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: errorBody(error) }, requestConfig);
		}
	};
}
