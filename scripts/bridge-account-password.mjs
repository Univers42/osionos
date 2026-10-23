/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-password.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/password: sets a new password for the caller and signs every OTHER
 * sign-in out. The sudo grant is the authentication (the old password is never asked for or
 * read); the grant is spent by the change.
 *
 * Order, each step before the next: the attempt is counted (before sudo, so a caller without
 * a grant burns the budget too), sudo is required, the body is checked, the audit row is
 * written, GoTrue's admin route sets the password, the grant is spent, then one PATCH
 * revokes every refresh family but the caller's own (the shape of bridge-sessions.mjs
 * revokeFamily: reason, return=representation, applyLocal per returned row). With session
 * records off there are no families, so a user-wide cut-off signs everyone out, the caller
 * too, and `x-session-revoked: all` tells the client to sign in again.
 *
 * Caveat: GoTrue's own refresh tokens for the user survive the change (the admin route
 * has no per-user sign-out that is verified on the pinned grobase); the osionos session is
 * what gates the app. Personal access tokens are not revoked: the spec is silent.
 * Caveat: the strength rule (10-128 characters, 3 of 4 classes, not the address) is the
 * interim rule of the devil review; the gateway's registration policy is unread, so this
 * may be stricter or looser than it. Strictness errs toward refusing.
 * Caveat: a revoke that fails after GoTrue accepted the password answers 503 with the
 * password already changed; the user signs the other devices out from the sessions list.
 */

import { accountError, accountAddress, callerSession, clientMetaOf, noContent, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { timestampMicros, writeSessionCutoff } from './bridge-session-cutoff.mjs';
import { sessionClock } from './bridge-sessions.mjs';

const PATH = '/api/account/password';
const LIMIT = { limit: 5, windowMs: 3_600_000 };
const MIN_LENGTH = 10;
const MAX_LENGTH = 128;
const MIN_CLASSES = 3;
const ALLOWED_KEYS = new Set(['nextPassword', 'currentPassword']);
const GOTRUE_TIMEOUT_MS = 8_000;
const UNAVAILABLE = 'The account service is unavailable; try again shortly.';
const CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];

const invalidPassword = (message) => accountError(422, 'invalid_password', message);

/** The new password out of the body, or the 422 that says what is wrong with the request. */
function readNextPassword(body) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw accountError(422, 'invalid_body', 'The body must be an object.');
	if (Object.keys(body).some((key) => !ALLOWED_KEYS.has(key))) throw accountError(422, 'invalid_body', 'The body has a field this route does not read.');
	if (typeof body.nextPassword !== 'string') throw invalidPassword('The new password must be text.');
	return body.nextPassword;
}

function assertStrongEnough(password, address) {
	if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) throw invalidPassword(`The password must be ${MIN_LENGTH} to ${MAX_LENGTH} characters.`);
	if (CLASSES.filter((shape) => shape.test(password)).length < MIN_CLASSES) throw invalidPassword('Use at least three of: lower case, upper case, digits, symbols.');
	if (password.toLowerCase() === address) throw invalidPassword('The password cannot be the address of the account.');
}

async function writePassword({ config, fetchImpl }, userId, password) {
	let response;
	try {
		response = await fetchImpl(`${config.baasUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
			method: 'PUT',
			headers: { Accept: 'application/json', 'content-type': 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
			body: JSON.stringify({ password }),
			signal: AbortSignal.timeout(GOTRUE_TIMEOUT_MS),
		});
	} catch { throw accountError(503, 'account_plane_unavailable', UNAVAILABLE); }
	if (!response.ok) throw accountError(503, 'account_plane_unavailable', UNAVAILABLE);
}

/** Every live row of the user's other families (a legacy row with no family is its own), in one write. */
async function revokeOtherFamilies({ config, pg }, session) {
	const own = String(session.raw.jti).toLowerCase();
	const ownRow = await pg.asService().get(`osionos_sessions?${new URLSearchParams({ id: `eq.${own}`, user_id: `eq.${session.userId}`, select: 'family_id', limit: '1' })}`);
	const family = String((Array.isArray(ownRow) ? ownRow[0]?.family_id : null) ?? own).toLowerCase();
	const params = new URLSearchParams({
		user_id: `eq.${session.userId}`,
		revoked_at: 'is.null',
		id: `neq.${own}`,
		or: `(family_id.is.null,family_id.neq.${family})`,
		select: 'id,expires_at',
	});
	const rows = await pg.asService().patch(
		`osionos_sessions?${params}`,
		{ revoked_at: new Date(sessionClock(config)).toISOString(), revoked_reason: 'password_change' },
		{ prefer: 'return=representation' },
	);
	for (const row of Array.isArray(rows) ? rows : []) {
		const id = String(row?.id ?? '').toLowerCase();
		if (id) config.sessionRevocations?.applyLocal(id, timestampMicros(row?.expires_at) ?? 0);
	}
}

async function signEveryoneOut({ config, fetchImpl }, userId, response) {
	const atMs = sessionClock(config);
	await writeSessionCutoff(config, fetchImpl, userId, atMs);
	config.sessionCutoffs?.applyLocal(userId, atMs * 1000);
	response.setHeader('x-session-revoked', 'all');
	response.setHeader('access-control-expose-headers', 'x-session-revoked');
}

async function changePassword(deps, session, request, response) {
	const { config, kv, pg, fetchImpl } = deps;
	await rateLimit(kv, ['password-change', session.userId], LIMIT);
	await requireSudo(kv, session);
	const password = readNextPassword(await readBody(request));
	if (!config.baasUrl || !config.serviceKey) throw accountError(503, 'account_plane_unavailable', UNAVAILABLE);
	assertStrongEnough(password, await accountAddress({ config, fetchImpl }, session.userId));
	await writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType: 'account.password_changed', details: {} });
	await writePassword(deps, session.userId, password);
	await kv.getDel(`sudo:${String(session.raw.jti).toLowerCase()}`);
	if (config.sessionRecords?.enabled) await revokeOtherFamilies(deps, session);
	else await signEveryoneOut(deps, session.userId, response);
	return noContent(response, config);
}

/** The change-password route of the account plane; true when it handled the request. */
export function createAccountPasswordRoutes({ config, pg, kv, verifySession, fetchImpl = null }) {
	const call = typeof fetchImpl === 'function' ? fetchImpl : (url, init) => globalThis.fetch(url, init);
	return async function handleAccountPassword(url, request, response) {
		if (url.pathname !== PATH) return false;
		try {
			const session = callerSession(request, config, verifySession);
			if ((request.method || 'GET').toUpperCase() !== 'POST') throw accountError(405, 'method_not_allowed', `Method ${request.method} is not supported on this route.`);
			return await changePassword({ config, pg, kv, fetchImpl: call }, session, request, response);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
