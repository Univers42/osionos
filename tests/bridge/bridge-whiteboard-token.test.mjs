/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-whiteboard-token.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The whiteboard token (C598): it names the session's user, never outlives the session or
// five minutes, and neither it nor the session token verifies as the other.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { WHITEBOARD_TOKEN_TTL_SECONDS, signWhiteboardToken, verifyWhiteboardToken } from '../../scripts/bridge-whiteboard-token.mjs';
import { IDS, harnessConfig, sessionHeaders } from './support/bridge-harness.mjs';

const config = harnessConfig();
const sessionToken = () => sessionHeaders(config, IDS.userA, IDS.homeA).authorization.slice('Bearer '.length);
const session = () => verifyAppSessionToken(sessionToken(), config);

describe('whiteboard token', () => {
	it('names the session user and lives at most five minutes', () => {
		const now = Date.now();
		const { token, exp } = signWhiteboardToken(session(), config, now);
		assert.equal(exp, Math.floor(now / 1000) + WHITEBOARD_TOKEN_TTL_SECONDS);
		assert.deepEqual(verifyWhiteboardToken(token, config, now), { userId: IDS.userA });
	});

	it('never outlives the session it came from', () => {
		const current = session();
		const ending = { ...current, raw: { ...current.raw, exp: Math.floor(Date.now() / 1000) + 30 } };
		assert.equal(signWhiteboardToken(ending, config).exp, ending.raw.exp);
	});

	it('is refused once expired', () => {
		const now = Date.now();
		const { token } = signWhiteboardToken(session(), config, now);
		assert.throws(() => verifyWhiteboardToken(token, config, now + (WHITEBOARD_TOKEN_TTL_SECONDS + 1) * 1000), { status: 401 });
	});

	it('does not stand in for the session, nor the session for it', () => {
		const { token } = signWhiteboardToken(session(), config);
		assert.throws(() => verifyAppSessionToken(token, config), { status: 401 });
		assert.throws(() => verifyWhiteboardToken(sessionToken(), config), { status: 401 });
	});

	it('is refused when tampered with or signed by another secret', () => {
		const { token } = signWhiteboardToken(session(), config);
		const [version, payload, signature] = token.split('.');
		const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), sub: IDS.userB })).toString('base64url');
		assert.throws(() => verifyWhiteboardToken(`${version}.${forged}.${signature}`, config), { status: 401 });
		const other = harnessConfig({ env: { OSIONOS_APP_SESSION_SECRET: 'another-app-session-secret-long-enough' } });
		assert.throws(() => verifyWhiteboardToken(token, other), { status: 401 });
	});
});
