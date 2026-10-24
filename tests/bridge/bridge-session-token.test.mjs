/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-token.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The osionos_v1 app-session token, exercised through the module the bridge and osionos-ai
// both import: a token the bridge signs is the very token osionos-ai verifies. The config
// is the shape configFromEnv() hands the token code (tests/bridge/bridge-api.test.mjs);
// this file imports no bridge module, which is the point: the token module stands alone.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signAppSessionToken, verifyAppSessionToken } from '../../scripts/bridge-session-token.mjs';

const subject = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const workspaceId = '1cc0693b-59dd-4d51-86d9-de86d088f9df';
const jti = '1c76c7f0-f07e-442d-96fd-77d601764c3b';
const now = 1_768_000_000_000;
const ttlSeconds = 3600;
const payload = { provider: 'prismatica', subject, email: 'Owner@example.com', name: 'Owner' };
const workspace = { _id: workspaceId };

/** The config configFromEnv() hands the token code: the secret, the TTL, the cut-off tracker. */
function testConfig() {
	return {
		appSessionSecret: 'test-app-session-secret-that-is-long-enough',
		sessionTtlSeconds: ttlSeconds,
		sessionCutoffs: null,
	};
}

function signedToken(config = testConfig(), issuedAt = now) {
	return signAppSessionToken({ payload, workspace, config, now: issuedAt, jti });
}

/** The error a call threw, or null when it did not throw. */
function rejectionOf(run) {
	try {
		run();
		return null;
	} catch (error) {
		return error;
	}
}

describe('the osionos_v1 app-session token', () => {
	it('verifies a token it just signed: same user id, same workspace', () => {
		const config = testConfig();
		const { token, expiresAt } = signedToken(config);
		const verified = verifyAppSessionToken(token, config, now + 1000);
		assert.equal(verified.userId, subject);
		assert.deepEqual(verified.workspaceIds, [workspaceId]);
		assert.equal(verified.roles[workspaceId], 'owner');
		assert.equal(verified.isAdmin, false);
		assert.equal(expiresAt, new Date((Math.floor(now / 1000) + ttlSeconds) * 1000).toISOString());
	});

	it('rejects a token whose signature changed by one character', () => {
		const config = testConfig();
		const { token } = signedToken(config);
		const replacement = token.endsWith('a') ? 'b' : 'a';
		const error = rejectionOf(() => verifyAppSessionToken(token.slice(0, -1) + replacement, config, now + 1000));
		assert.equal(error?.status, 401);
		assert.match(error?.message ?? '', /signature is invalid/);
	});

	it('rejects a token once now is past the TTL', () => {
		const config = testConfig();
		const { token } = signedToken(config);
		// The token lives until the second its exp names, so exp - 1 is its last valid second.
		assert.equal(rejectionOf(() => verifyAppSessionToken(token, config, now + ttlSeconds * 1000 - 1000)), null);
		const error = rejectionOf(() => verifyAppSessionToken(token, config, now + ttlSeconds * 1000));
		assert.equal(error?.status, 401);
		assert.match(error?.message ?? '', /expired/);
	});

	it('rejects a token carrying another version prefix', () => {
		const config = testConfig();
		const { token } = signedToken(config);
		const [, encodedPayload, signature] = token.split('.');
		for (const version of ['osionos_v2', 'osionos_v0', 'v1']) {
			const error = rejectionOf(() => verifyAppSessionToken(`${version}.${encodedPayload}.${signature}`, config, now + 1000));
			assert.equal(error?.status, 401);
			assert.match(error?.message ?? '', /token is invalid/);
		}
	});
});
