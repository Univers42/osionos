/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-sudo-password.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The password factor of the sudo step-up (#234/#232): whether this account's session
 * proves a password was used, and the check itself.
 *
 * The signal is the bridge's own record, never a guess from GoTrue: its admin payload
 * does not carry `encrypted_password`, and an `email` identity does not prove a password
 * either. `bridge-sessions.mjs` records the sign-in method of the session family, so the
 * only family the bridge can prove is the one whose root says `password`. A handoff
 * session says `handoff`; until the gateway puts the sign-in method in the handoff
 * payload (prismatica), such a session keeps the emailed code. That is the known gap of
 * this half, not a decision taken here.
 *
 * The check runs through the gateway, never against GoTrue directly: the gateway already
 * owns the per-address lockout, its alert and its audit row, and a second guess budget in
 * the bridge would hand a stolen session a quiet password oracle — exactly what the issue
 * fears. The route is NOT in this repo yet; until it ships, a password-bearing session
 * answers 503 `sudo_unavailable` instead of sending a code (fail closed). Proposed
 * contract for prismatica's half:
 *
 *   POST {gatewayUrl}/api/auth/verify-password
 *   headers: content-type, accept, x-osionos-sudo-timestamp,
 *            x-osionos-sudo-signature = HMAC-SHA256(sharedSecret,
 *              `${timestamp}.password.${path}.${rawBody}`)
 *   body:   { email, password }
 *   answers: 200 { valid: true } | 401/403 { valid: false } | 429 + Retry-After
 */

import { createHmac } from 'node:crypto';

const VERIFY_PATH = '/api/auth/verify-password';
const TIMEOUT_MS = 8_000;
const UNAVAILABLE = 'The step-up service is unavailable; try again shortly.';
const WRONG_PASSWORD = 'That password is not right.';
const SESSION_COLUMNS = 'id,family_id,auth_method';

/** The row of a session, or null; a service-role read so a revoked or legacy row is not a guess. */
async function sessionRow(pg, id) {
	const params = new URLSearchParams({ id: `eq.${id}`, select: SESSION_COLUMNS, limit: '1' });
	const rows = await pg.asService().get(`osionos_sessions?${params}`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** The sign-in method of the session's family; a storage fault is an outage, never a "no". */
async function signInMethod(pg, id, fail) {
	try {
		const row = await sessionRow(pg, id);
		if (!row) return null;
		const method = String(row.auth_method ?? '');
		if (method !== 'refresh') return method;
		const family = String(row.family_id ?? '').toLowerCase();
		if (family === '' || family === id) return method;
		return String((await sessionRow(pg, family))?.auth_method ?? '') || null;
	} catch {
		throw fail(503, 'sudo_unavailable', UNAVAILABLE);
	}
}

/** The address the gateway would also attribute the request to. */
function forwardedFor(request) {
	const incoming = String(request?.headers?.['x-forwarded-for'] ?? '').trim();
	return [incoming, request?.socket?.remoteAddress ?? ''].filter(Boolean).join(', ');
}

/**
 * The gate of the step-up: `required` reads the sign-in method of the session's family,
 * `verify` asks the gateway. `fail` builds the caller's error, so this module imports
 * nothing from the sudo routes.
 */
export function createPasswordGate({ pg, fetchImpl, now = () => Date.now(), fail }) {
	/** Whether this session was opened with a password, so the step-up must repeat it. */
	async function required({ config, session }) {
		if (!config?.sessionRecords?.enabled) return false;
		const id = String(session?.raw?.jti ?? '').toLowerCase();
		if (id === '') return false;
		return (await signInMethod(pg, id, fail)) === 'password';
	}

	/** Ask the gateway; a wrong password is the user's refusal, an absent route is an outage. */
	async function verify({ config, request }, address, password) {
		if (!config.gatewayUrl || !config.sharedSecret) throw fail(503, 'sudo_unavailable', UNAVAILABLE);
		const body = JSON.stringify({ email: address, password });
		const timestamp = String(Math.floor(now() / 1000));
		const signature = createHmac('sha256', config.sharedSecret).update(`${timestamp}.password.${VERIFY_PATH}.${body}`).digest('hex');
		const forwarded = forwardedFor(request);
		let response;
		try {
			response = await fetchImpl(`${config.gatewayUrl}${VERIFY_PATH}`, {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					'x-osionos-sudo-timestamp': timestamp,
					'x-osionos-sudo-signature': signature,
					...(forwarded ? { 'x-forwarded-for': forwarded } : {}),
				},
				body,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch {
			throw fail(503, 'sudo_unavailable', UNAVAILABLE);
		}
		if (response.status === 401 || response.status === 403) throw fail(403, 'password_invalid', WRONG_PASSWORD);
		if (response.status === 429) {
			const retryAfter = Number(response.headers.get('retry-after'));
			throw fail(429, 'rate_limited', 'Too many password attempts.', Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {});
		}
		if (!response.ok) throw fail(503, 'sudo_unavailable', UNAVAILABLE);
		const payload = await response.json().catch(() => null);
		if (payload?.valid !== true) throw fail(403, 'password_invalid', WRONG_PASSWORD);
	}

	return { required, verify };
}
