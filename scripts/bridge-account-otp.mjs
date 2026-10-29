/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-otp.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of grobase's login-OTP service, shared by every flow that proves possession
 * of a mailbox (the sudo step-up, secondary emails): request a code, verify it for a
 * proof, check the proof, spend it once.
 *
 * `fail` builds the caller's error (accountError, passed in so this module imports nothing
 * from the sudo routes) and `codes` names the two codes that differ per flow, so a flow's
 * clients keep their own stable error codes.
 *
 * Caveat: the proof is bound to an address, not to a purpose or a session; single use is
 * the bridge's own `otp-proof:` marker in the shared store, whose prefix must not change
 * while an older bridge can still be running against the same store.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const PROOF_AUDIENCE = 'otp-proof';
const OTP_TIMEOUT_MS = 8_000;
const UNAVAILABLE = 'The step-up service is unavailable; try again shortly.';
const BAD_PROOF = 'The step-up could not be verified; ask for a new code.';

/** @param {{ fail: (status: number, code: string, message: string, extra?: object) => Error, codes: { unavailable: string, proofInvalid: string, unavailableMessage?: string } }} options */
export function createOtpClient({ fail, codes }) {
	const unavailable = (extra) => fail(503, codes.unavailable, codes.unavailableMessage ?? UNAVAILABLE, extra);

	/** One call to grobase, or the failure that says the step-up is unavailable. */
	async function grobase(config, fetchImpl, path, { method = 'GET', body, headers = {} } = {}) {
		try {
			return await fetchImpl(`${config.baasUrl}${path}`, {
				method,
				headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(OTP_TIMEOUT_MS),
			});
		} catch { throw unavailable(); }
	}

	/** Ask grobase to mail the code. Its own throttling (Kong) is not the user's limit. */
	async function requestCode({ config, fetchImpl }, address) {
		const response = await grobase(config, fetchImpl, '/v1/auth/otp/request', {
			method: 'POST',
			body: { email: address },
			headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
		});
		if (response.status === 429) {
			const retryAfter = Number(response.headers.get('retry-after'));
			throw unavailable(Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {});
		}
		if (!response.ok) throw unavailable();
		const payload = await response.json().catch(() => null);
		if (payload?.sent !== true) throw unavailable();
	}

	/** The proof grobase answers with, or the failure that says the code was not accepted. */
	async function verifyCode({ config, fetchImpl }, address, code) {
		const response = await grobase(config, fetchImpl, '/v1/auth/otp/verify', { method: 'POST', body: { email: address, code } });
		// 401 is the wrong code, not a session problem: the client reads a 401 as "sign in
		// again", and the session is fine.
		if (response.status === 401) throw fail(422, 'code_invalid', 'That code is not the right one.');
		if (response.status === 410) throw fail(410, 'code_expired', 'That code has expired; ask for a new one.');
		if (response.status === 429) throw fail(429, 'code_locked', 'Too many attempts; ask for a new code.');
		if (!response.ok) throw unavailable();
		const payload = await response.json().catch(() => null);
		return typeof payload?.proof === 'string' ? payload.proof : '';
	}

	/**
	 * The proof is CHECKED, not trusted: the algorithm is exactly HS256, the signature
	 * verifies against the GoTrue secret, the audience is the proof one, the expiry is in
	 * the future and the address is the one the code went to. A failure is a fault of
	 * grobase or of the secret, never of the user's, so it is a 502.
	 */
	function checkProof(proof, { secret, address, now }) {
		const parts = String(proof ?? '').split('.');
		if (parts.length !== 3) return null;
		let header;
		let claims;
		try {
			header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
			claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
		} catch {
			return null;
		}
		if (!header || typeof header !== 'object' || Array.isArray(header)) return null;
		if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;
		if (header.alg !== 'HS256') return null;
		let expected;
		let given;
		try {
			expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
			given = Buffer.from(parts[2], 'base64url');
		} catch {
			return null;
		}
		if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
		if (claims.aud !== PROOF_AUDIENCE) return null;
		const exp = Number(claims.exp);
		if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
		if (String(claims.otp ?? '').toLowerCase() !== address.toLowerCase()) return null;
		return { exp };
	}

	/**
	 * Spend the checked proof once. `onSpent(fresh)` runs before the refusal so the caller
	 * can audit the attempt first; a proof that is not fresh (or failed the check, `checked`
	 * null) is then refused with the flow's `proofInvalid` code.
	 */
	async function spendProof(kv, proof, checked, now, onSpent = async () => {}) {
		const marker = `otp-proof:${createHash('sha256').update(proof).digest('hex')}`;
		let fresh;
		try {
			fresh = checked ? await kv.setNx(marker, '1', Math.max(1, Math.floor(checked.exp * 1000 - now))) : false;
		} catch {
			throw unavailable();
		}
		await onSpent(fresh);
		if (!fresh) throw fail(502, codes.proofInvalid, BAD_PROOF);
	}

	return { requestCode, verifyCode, checkProof, spendProof };
}
