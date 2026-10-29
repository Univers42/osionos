/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   session-signin.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * A real sign-in against the test bridge: a gateway-signed handoff, consumed the way the
 * app does. The refresh suites share it so no spec re-builds the handshake.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { USER_A, gatewayRequest, postJson } from './session-world.mjs';

export function tokenClaims(accessToken) {
	return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
}

export async function mintHandoff(base, subject = USER_A) {
	const payload = { provider: 'prismatica', subject, email: 'member@example.com', name: 'Member', jti: randomUUID() };
	const request = gatewayRequest(payload, { timestamp: Date.now() });
	const minted = await postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
	assert.equal(minted.status, 200);
	return new URL(minted.body.redirectUrl).hash.replace('#bridge_token=', '');
}

/** The consume answer, with the access token's claims and the refresh token pulled out. */
export async function signIn(base, subject = USER_A, userAgent = 'bridge-test-agent') {
	const token = await mintHandoff(base, subject);
	const answer = await postJson(base, '/api/auth/bridge/consume', { headers: { 'user-agent': userAgent }, body: { token } });
	assert.equal(answer.status, 200);
	const { accessToken, refreshToken } = answer.body.session;
	return { answer, accessToken, refreshToken, claims: tokenClaims(accessToken) };
}

export const refreshWith = (base, refreshToken, headers = {}) =>
	postJson(base, '/api/auth/bridge/refresh', { headers, body: { refreshToken } });
