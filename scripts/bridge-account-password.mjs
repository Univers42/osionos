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
 * Order: the attempt is counted (before sudo, so a caller without a grant burns the budget
 * too), sudo is checked, the body is validated, then the grant is SPENT atomically
 * (`kv.getDel`; null means a parallel request took it: 403, no write), the audit row is
 * written, and GoTrue's admin route sets the password. If the audit or the PUT fails the
 * grant is restored. Afterwards one write revokes every refresh family but the caller's own
 * (`revokeOtherFamilies` of bridge-sessions.mjs). If that fails, or session records are
 * off, a user-wide cut-off signs everyone out, the caller too: 204 with
 * `x-session-revoked: all`. If the cut-off also fails the answer is 503
 * `password_changed_signout_failed`, whose message says the password HAS changed. There is
 * never a 2xx without one of the two revokes.
 *
 * GoTrue at the pinned image supabase/gotrue:v2.188.1 (docker-compose.track-binocle.yml:100),
 * read at tag v2.188.1 of supabase/auth: PUT /admin/users/{id} is routed at
 * internal/api/api.go:370 to adminUserUpdate; with a password it calls
 * user.UpdatePassword(tx, nil) (internal/api/admin.go:210-211), and a nil session id runs
 * Logout(tx, u.ID) (internal/models/user.go:377-379), which deletes every row of the user's
 * `sessions` table (internal/models/sessions.go:341-343). So the admin PUT ends the user's
 * GoTrue sessions itself and no second admin call is needed; no admin sign-out route exists
 * at that tag (api.go:340-387 lists none). Not read at the tag: the refresh_tokens foreign
 * key, so "their refresh tokens die" rests on a refresh needing its session row.
 * The 72-byte cap is bcrypt's input limit, not read from the tag.
 * Release note (devil D-P3-1b C10): the gateway's /api/auth/osionos-session mints from any
 * GoTrue access token that `auth.getUser()` accepts (apps/opposite-osiris
 * scripts/auth-gateway.mjs:950-972 at 47ca59e7; no amr or age check). The PUT above deletes the
 * user's GoTrue sessions, so a website refresh token cannot outlive the change. Not verified at
 * the tag: whether getUser refuses an unexpired access token whose session row is gone; until
 * it is, such a token (at most its 1 h lifetime) may still mint an osionos session.
 *
 * Caveat: personal access tokens are not revoked (deliberate, tested): a PAT is created
 * only under sudo and the owner's PATs survive a password change as on other platforms.
 * Caveat: the strength rule (10 characters, 72 bytes, 3 of 4 classes, not the address) is
 * the interim rule of the devil review; the gateway's registration policy is unread, so it
 * may be stricter or looser. A GoTrue 422 is still answered 422.
 * Caveat: a process kill between the PUT and the revoke leaves the old sessions live; the
 * user signs them out from the sessions list.
 */

import { accountError, accountAddress, callerSession, clientMetaOf, noContent, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { grantSudo, rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { timestampMicros, writeSessionCutoff } from './bridge-session-cutoff.mjs';
import { revokeOtherFamilies, sessionClock } from './bridge-sessions.mjs';

const PATH = '/api/account/password';
const LIMIT = { limit: 5, windowMs: 3_600_000 };
const MIN_LENGTH = 10;
const MAX_BYTES = 72;
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
	if (password.length < MIN_LENGTH || Buffer.byteLength(password) > MAX_BYTES) throw invalidPassword(`The password must be ${MIN_LENGTH} characters to ${MAX_BYTES} bytes.`);
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
	// GoTrue's own 422 (weak or too long) is the caller's mistake; the upstream body is never echoed.
	if (response.status === 422) throw invalidPassword('The password was refused; choose a longer, less common one.');
	if (!response.ok) throw accountError(503, 'account_plane_unavailable', UNAVAILABLE);
}

/** The caller's family: its own row's family_id, or its own id for a legacy row. */
async function ownFamily({ pg }, session, own) {
	const rows = await pg.asService().get(`osionos_sessions?${new URLSearchParams({ id: `eq.${own}`, user_id: `eq.${session.userId}`, select: 'family_id', limit: '1' })}`);
	return String((Array.isArray(rows) ? rows[0]?.family_id : null) ?? own).toLowerCase();
}

async function signEveryoneOut({ config, fetchImpl }, userId, response) {
	const atMs = sessionClock(config);
	await writeSessionCutoff(config, fetchImpl, userId, atMs);
	config.sessionCutoffs?.applyLocal(userId, atMs * 1000);
	response.setHeader('x-session-revoked', 'all');
	response.setHeader('access-control-expose-headers', 'x-session-revoked');
}

/** Ends the other sign-ins; the cut-off is the fallback, and the last resort is an honest 503. */
async function endOtherSignIns(deps, session, response) {
	const { config } = deps;
	if (config.sessionRecords?.enabled) {
		try {
			const own = String(session.raw.jti).toLowerCase();
			await revokeOtherFamilies(deps, { userId: session.userId, keepFamilyId: await ownFamily(deps, session, own), keepRowId: own, reason: 'password_change' });
			return;
		} catch { /* the cut-off below is the fallback: it signs the caller out too, which beats a live thief */ }
	}
	try {
		await signEveryoneOut(deps, session.userId, response);
	} catch {
		throw accountError(503, 'password_changed_signout_failed', 'Your password HAS changed, but other devices could not be signed out. Sign them out from your sessions list.');
	}
}

/** Spends the grant, writes the audit row and the password; any failure before GoTrue accepts restores the grant. */
async function spendAndWrite(deps, session, request, password) {
	const { config, kv, pg } = deps;
	const granted = await kv.getDel(`sudo:${String(session.raw.jti).toLowerCase()}`);
	if (granted !== session.userId) throw accountError(403, 'sudo_required', 'Sudo is required for this action.');
	try {
		await writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType: 'account.password_changed', details: {} });
		await writePassword(deps, session.userId, password);
	} catch (error) {
		await grantSudo(kv, session).catch(() => {}); // best effort: a lost grant only costs a new code
		throw error;
	}
}

async function changePassword(deps, session, request, response) {
	const { config, kv, fetchImpl } = deps;
	await rateLimit(kv, ['password-change', session.userId], LIMIT);
	await requireSudo(kv, session);
	const password = readNextPassword(await readBody(request));
	if (!config.baasUrl || !config.serviceKey) throw accountError(503, 'account_plane_unavailable', UNAVAILABLE);
	assertStrongEnough(password, await accountAddress({ config, fetchImpl }, session.userId));
	await spendAndWrite(deps, session, request, password);
	await endOtherSignIns(deps, session, response);
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
