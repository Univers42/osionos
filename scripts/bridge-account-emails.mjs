/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * GET /api/account/emails: the caller's primary address and whether GoTrue confirmed it.
 *
 * Read-only on purpose: adding, removing and changing the primary address need a
 * mail-verification flow and a table (osionos_user_emails) that do not exist yet (F-3b),
 * so POST on this path answers 405 and the `:id` sub-paths answer 404 `not_found`.
 *
 * Caveat: the list is the primary address only, so a user who added a second address
 * elsewhere would not see it here. `verifiedAt` is GoTrue's `email_confirmed_at` and is
 * null when GoTrue states none, which the client shows as "Not confirmed", never as
 * "Verified". An outage answers 503 `settings_read_failed`, never an `_unavailable` code.
 */

import { accountError, callerSession, respondWithError } from './bridge-account-sudo.mjs';
import { limitOrFail, settingsFailure } from './bridge-account-settings.mjs';
import { readGotrueUser } from './bridge-gotrue-user.mjs';
import { sendJson } from './bridge-social-core.mjs';

const PATH = /^\/api\/account\/emails(?:\/.*)?$/;
const ROUTE = '/api/account/emails';
const LIMIT = { limit: 30, windowMs: 60_000 };

const text = (value) => (typeof value === 'string' && value !== '' ? value : null);

/** The allowlisted EmailRecord of the payload; nothing else of the GoTrue user is read. */
function primaryRecord(userId, payload) {
	const email = text(payload?.email);
	if (!email) return [];
	const createdAt = text(payload.created_at);
	return [{
		_id: `primary-${userId}`,
		userId,
		email,
		isPrimary: true,
		verifiedAt: text(payload.email_confirmed_at),
		createdAt,
		updatedAt: text(payload.updated_at) ?? createdAt,
		removedAt: null,
	}];
}

async function readPrimary(deps, userId) {
	try {
		return primaryRecord(userId, await readGotrueUser(deps, userId));
	} catch (error) {
		if (error?.upstreamStatus === 404) return [];
		throw settingsFailure('read the account email');
	}
}

export function createAccountEmailsRoutes({ config, kv, verifySession, fetchImpl = fetch }) {
	return async function handleEmailsRequest(url, request, response) {
		if (!PATH.test(url.pathname)) return false;
		try {
			const session = callerSession(request, config, verifySession);
			if (url.pathname !== ROUTE) throw accountError(404, 'not_found', 'There is no email on that path.');
			const method = (request.method || 'GET').toUpperCase();
			if (method !== 'GET') throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
			await limitOrFail(kv, ['account-emails', session.userId], LIMIT);
			sendJson(response, 200, await readPrimary({ config, fetchImpl }, session.userId), config);
		} catch (error) {
			respondWithError(response, error, config);
		}
		return true;
	};
}
