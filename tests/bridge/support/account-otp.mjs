/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-otp.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * grobase's login-OTP service and GoTrue's admin user route, as the bridge sees them:
 * the code request, the code verify, and the read of the caller's own address.
 *
 * The fake applies the rules the bridge has to survive: the request route answers 404
 * when EMAIL_OTP_ENABLED is off, 502 when the mail could not be sent and 429 when Kong
 * throttles the bridge's own address; the verify route answers 401, 410 and 429 for a
 * wrong, an expired and a locked code.
 *
 * The proof it mints is a real HS256 JWT, so the bridge's own checks run against a
 * signature that verifies — and the broken proofs are minted here too: another secret,
 * `alg: none`, `alg: HS512`, another audience, a foreign address, an expired proof.
 */

import { createHmac } from 'node:crypto';

export const OTP_SECRET = 'otp-proof-test-secret';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
	status,
	headers: { 'content-type': 'application/json', ...headers },
});

const base64url = (text) => Buffer.from(text, 'utf8').toString('base64url');

/**
 * A proof as grobase mints it: HS256 over `{otp, aud, iat, exp}`, signed with the
 * GoTrue secret. Every claim can be broken on purpose — that is the point of the fake.
 *
 * `signWith` signs the proof with another algorithm than the header claims: the
 * signature then verifies under HS256 while the header says something else, which is
 * the only shape where the algorithm check is the ONLY check that can catch it.
 */
export function otpProof({
	email = 'member@example.com',
	secret = OTP_SECRET,
	alg = 'HS256',
	signWith = null,
	aud = 'otp-proof',
	otp = email,
	expOffsetSeconds = 300,
	iatOffsetSeconds = 0,
	now = Date.now(),
} = {}) {
	const seconds = Math.floor(now / 1000);
	const header = base64url(JSON.stringify({ alg, typ: 'JWT' }));
	const claims = base64url(JSON.stringify({
		otp: String(otp ?? '').toLowerCase(),
		aud,
		iat: seconds + iatOffsetSeconds,
		exp: seconds + expOffsetSeconds,
	}));
	const input = `${header}.${claims}`;
	if (alg === 'none') return `${input}.`;
	const digest = signWith ?? (alg === 'HS512' ? 'sha512' : 'sha256');
	return `${input}.${createHmac(digest, secret).update(input).digest('base64url')}`;
}

/**
 * The OTP service behind the bridge. Every answer is a knob, so a test names the fault
 * it wants instead of building a response of its own.
 */
export function createOtpService({
	email = 'member@example.com',
	secret = OTP_SECRET,
	now = () => Date.now(),
	adminStatus = 200,
	adminEmail = email,
	requestStatus = 200,
	requestBody = null,
	requestHeaders = {},
	verifyStatus = 200,
	verifyBody = null,
	verifyHeaders = {},
	proof = null,
	proofOptions = null,
	network = false,
} = {}) {
	const calls = [];

	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const method = init.method ?? 'GET';
		const body = init.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ path: parsed.pathname, method, body, headers: { ...(init.headers ?? {}) } });
		if (network) throw new Error('the network is down');
		if (parsed.pathname.startsWith('/auth/v1/admin/users/')) {
			if (adminStatus !== 200) return json({ message: 'no such user' }, adminStatus);
			return json({ id: 'user-id', email: adminEmail });
		}
		if (parsed.pathname === '/v1/auth/otp/request') {
			if (requestStatus !== 200) return json(requestBody ?? { error: 'send_failed' }, requestStatus, requestHeaders);
			return json(requestBody ?? { sent: true }, 200, requestHeaders);
		}
		if (parsed.pathname === '/v1/auth/otp/verify') {
			if (verifyStatus !== 200) return json(verifyBody ?? { error: 'invalid_code' }, verifyStatus, verifyHeaders);
			const answer = verifyBody ?? {
				verified: true,
				proof: proof ?? otpProof({ email, secret, now: now(), ...(proofOptions ?? {}) }),
			};
			return json(answer, 200, verifyHeaders);
		}
		return json({ message: 'not found' }, 404);
	};

	return { fetchImpl, calls };
}
