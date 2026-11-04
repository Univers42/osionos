/**
 * GET /api/capabilities: which optional features this bridge serves, as one 200.
 *
 * Each feature's own route answers 404 while its flag is off, so the app used to learn "off"
 * from that 404, and Chrome logs every 404 as a console error (#293: GET /api/recs/for-you on
 * Home, GET /api/account/published-pages in Settings). The app reads this first and skips a
 * route its bridge does not serve. Each flag is read the way its own route reads it, so the two
 * cannot disagree.
 *
 * A session is required, like the routes themselves: a caller without a token cannot tell an
 * off feature from a missing route (the rule bridge-events.mjs keeps for the beacon).
 */

import { recsEnabled } from './bridge-recs.mjs';
import { bearerToken, sendJson } from './bridge-social-core.mjs';

const PATH = '/api/capabilities';

/** The publish feature: GET /api/account/published-pages and the public /p/ routes. */
export function publishEnabled(env) {
	return env?.OSIONOS_PUBLISH_ENABLED === '1';
}

export function bridgeCapabilities(env) {
	return { recs: recsEnabled(env), publish: publishEnabled(env) };
}

export function createCapabilitiesHandler({ config, verifySession, env = process.env }) {
	return async function handleCapabilities(url, request, response, requestConfig = config) {
		if (url.pathname !== PATH) return false;
		try {
			verifySession(bearerToken(request), requestConfig);
		} catch (error) {
			const status = Number(error?.status) === 403 ? 403 : 401;
			return sendJson(response, status, { ok: false, message: 'An app session is required.' }, requestConfig);
		}
		if ((request.method || 'GET').toUpperCase() !== 'GET') {
			return sendJson(response, 405, { ok: false, message: `Method ${request.method} is not supported here.` }, requestConfig);
		}
		return sendJson(response, 200, { capabilities: bridgeCapabilities(env) }, requestConfig);
	};
}
