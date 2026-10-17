/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-ide-token.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// POST /api/ide/token: the one place the app session is exchanged for an IDE token. The IDE
// process never sees the app token, so everything it will later trust (user, workspace,
// allowlist) is decided here, once.
import { bearerToken, readJsonBody } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { requireSandboxIdentity } from './ide-sandbox-spec.mjs';
import { ideTokenSecret, signIdeToken } from './ide-token.mjs';
import { jsonReply } from './bridge-ide-sandbox.mjs';
import { lookupIdeUsername } from './ide-username.mjs';

const BODY_LIMIT_BYTES = 1024;

// Only errors that carry an HTTP status were written for the client; anything else is an
// internal failure whose message stays on the server.
function refuse(response, error, requestConfig) {
	const status = error?.status;
	if (Number.isInteger(status) && status >= 400 && status < 600) {
		jsonReply(response, status, { ok: false, message: error.message }, requestConfig);
	} else {
		jsonReply(response, 500, { ok: false, message: 'The IDE token could not be issued.' }, requestConfig);
	}
	return true;
}

// Unlike the sandbox route this is not tied to OSIONOS_IDE_SANDBOX: the mint keeps working
// after the bridge stops hosting sandboxes, so only the token secret switches it on.
export function createIdeTokenHandler({ config, verifySession, env = process.env, fetchImpl = fetch }) {
	return async function handleIdeTokenRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== '/api/ide/token') return false;
		if (!env.OSIONOS_IDE_TOKEN_SECRET) {
			jsonReply(response, 404, { ok: false, message: 'The IDE is not enabled.' }, requestConfig);
			return true;
		}
		if ((request.method || 'GET').toUpperCase() !== 'POST') {
			return refuse(response, { status: 405, message: 'Method not allowed.' }, requestConfig);
		}
		try {
			const secret = ideTokenSecret(env);
			const session = verifySession(bearerToken(request), requestConfig);
			// Ponytail: 10 per burst, then one per 5 s, covers a client re-minting every ~13 min for a
			// handful of workspaces. A tab storm with many workspaces gets 429 and retries.
			takeToken(`ide-token:${session.userId}`, { capacity: 10, refillPerSec: 0.2 });
			const body = await readJsonBody(request, BODY_LIMIT_BYTES);
			const { userId, workspaceId } = requireSandboxIdentity(session, body?.workspaceId, env);
			// After the allowlist, so a refused account costs no query; a failed or slow lookup mints without a name.
			const username = await lookupIdeUsername(requestConfig, fetchImpl, userId);
			const { token, expiresAt } = signIdeToken({ userId, workspaceId, secret, username });
			jsonReply(response, 200, { ok: true, token, expiresAt }, requestConfig);
			return true;
		} catch (error) {
			// Outside the allowlist is the common case, not a fault: every account but the operators
			// meets it on each page load, and a 403 there is a console error in every browser
			// (groot's GR2 e2e, 2026-10-14). The answer is the same refusal, as a 200 the client
			// maps to not-allowed; the order of checks, and what an unlisted account learns, are unchanged.
			if (error?.code === 'not-allowed') {
				jsonReply(response, 200, { ok: false, reason: 'not-allowed', message: error.message }, requestConfig);
				return true;
			}
			return refuse(response, error, requestConfig);
		}
	};
}
