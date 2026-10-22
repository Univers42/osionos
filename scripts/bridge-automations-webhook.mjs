/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-automations-webhook.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/automations/webhook — the bridge delivers an automation's payload
 * to the endpoint the database rule names.
 *
 * The browser cannot reach an arbitrary host (CORS), so the bridge does it —
 * and the bridge must not become an SSRF proxy: HTTPS only, public hosts
 * only, 5 s cap, the response body dropped.
 *
 * The request goes through the same guard as the chat link preview
 * (bridge-url-guard + bridge-url-fetch): the address is checked against the
 * blocklist AND against the address the socket really connects to (a name
 * answering public at the check and private at the connect is refused), and no
 * redirect is followed — a webhook has no reason to chase one, and `fetch`'s
 * default `redirect: 'follow'` would walk a 30x straight into the private
 * network. A 3xx is the answer: the caller is told the status.
 *
 * Each caller has a webhook:<userId> bucket, charged before the address is
 * even looked up: a burst of 10 covers a rule firing on a bulk edit, 0.2/s
 * (12/min) stops a loop from using the bridge as a relay.
 *
 * `deps.webhookTransport` and `deps.resolveHost` are the injection seams the
 * tests drive; `deps.verifySession` is the caller's session check.
 */

import { bearerToken, httpError, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';
import { assertPublicHttpUrl, PRIVATE_ADDRESS_MESSAGE } from './bridge-url-guard.mjs';
import { guardedRequest } from './bridge-url-fetch.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

const WEBHOOK_TIMEOUT_MS = 5_000;
const WEBHOOK_BUCKET = { capacity: 10, refillPerSec: 0.2 };
/** The answer is dropped: read a little of it, so the socket does not stall. */
const WEBHOOK_RESPONSE_BYTES = 4 * 1024;

export async function handleAutomationWebhook(deps, request, response, config) {
	const session = deps.verifySession(bearerToken(request), config);
	const payload = await readJsonBody(request);
	takeToken(`webhook:${session.userId}`, WEBHOOK_BUCKET);
	const parsed = await assertPublicHttpUrl(safeText(payload.url, 2048), { resolve: deps.resolveHost });
	if (parsed.protocol !== 'https:') throw httpError('Automation webhooks must use https.', 422);
	let status = 0;
	try {
		const upstream = await guardedRequest(parsed.href, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload.payload ?? {}),
			timeoutMs: WEBHOOK_TIMEOUT_MS,
			maxBytes: WEBHOOK_RESPONSE_BYTES,
			resolve: deps.resolveHost,
			transport: deps.webhookTransport,
		});
		status = upstream.status;
	} catch (error) {
		// The guard refused the address at connect time: that is a 422 with the
		// guard's message, not a webhook that failed to answer.
		if (error?.code === 'private_address') throw httpError(PRIVATE_ADDRESS_MESSAGE, 422);
		sendJson(response, 502, { ok: false, message: 'Webhook endpoint did not respond.' }, config);
		return;
	}
	sendJson(response, 200, { ok: status >= 200 && status < 300, status }, config);
}
