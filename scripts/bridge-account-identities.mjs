/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-identities.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * GET /api/account/identities: the sign-in identities GoTrue holds for the CALLER.
 *
 * The user id is the session's own; no query string, header or body can name another.
 * GoTrue's admin route answers with the whole user, so each identity is projected to an
 * allowlist here and `identity_data`, tokens and raw metadata never leave the bridge.
 *
 * Read-only on purpose: GoTrue v2.188.1 has no admin route that deletes an identity
 * (internal/api/api.go:340-375); its only delete is `DELETE /user/identities/{id}` behind
 * the user's own token (api.go:270-279). Any other verb answers 405.
 *
 * Caveat: whether the account still has a password is not reported, because the admin
 * payload never carries `encrypted_password` (internal/models/user.go:31, `json:"-"`).
 */

import { accountError, callerSession, respondWithError } from './bridge-account-sudo.mjs';
import { readGotrueUser } from './bridge-gotrue-user.mjs';
import { sendJson } from './bridge-social-core.mjs';

const PATH = /^\/api\/account\/identities(?:\/[^/]*)?$/;
const UNAVAILABLE = 'Sign-in methods are unavailable right now; try again shortly.';

const text = (value) => (typeof value === 'string' && value !== '' ? value : null);

/** The allowlisted shape of one GoTrue identity; anything not named here is dropped. */
export function projectIdentity(identity) {
	return {
		provider: text(identity?.provider) ?? 'unknown',
		identityId: text(identity?.identity_id) ?? text(identity?.id),
		email: text(identity?.email) ?? text(identity?.identity_data?.email),
		linkedAt: text(identity?.created_at),
		lastSignInAt: text(identity?.last_sign_in_at),
	};
}

async function readIdentities(deps, userId) {
	let payload;
	try {
		payload = await readGotrueUser(deps, userId);
	} catch {
		throw accountError(503, 'account_plane_unavailable', UNAVAILABLE);
	}
	return (Array.isArray(payload?.identities) ? payload.identities : []).map(projectIdentity);
}

export function createAccountIdentitiesRoutes({ config, verifySession, fetchImpl = fetch }) {
	return async function handleIdentitiesRequest(url, request, response) {
		if (!PATH.test(url.pathname)) return false;
		try {
			if (request.method !== 'GET' || url.pathname !== '/api/account/identities') {
				throw accountError(405, 'method_not_allowed', `Method ${request.method} is not supported on this route.`);
			}
			const session = callerSession(request, config, verifySession);
			const identities = await readIdentities({ config, fetchImpl }, session.userId);
			sendJson(response, 200, { identities }, config);
		} catch (error) {
			respondWithError(response, error, config);
		}
		return true;
	};
}
