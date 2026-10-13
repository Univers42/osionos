/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-token.test.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
	IDE_TOKEN_VERSION,
	PREVIEW_CAP_VERSION,
	ideTokenSecret,
	signIdeToken,
	verifyIdeToken,
	signPreviewCap,
	verifyPreviewCap,
} from '../../scripts/ide-token.mjs';
import { signAppSessionToken, verifyAppSessionToken, configFromEnv } from '../../scripts/bridge-api.mjs';

const TEST_SECRET = 'k'.repeat(32);
const APP_SECRET = 'm'.repeat(40);
const USER_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const WORKSPACE_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const NOW = 1_768_000_000_000;
const NOW_SEC = Math.floor(NOW / 1000);

function base64url(input) {
	return Buffer.from(input).toString('base64url');
}

function base64urlDecode(input) {
	return Buffer.from(input, 'base64url').toString('utf8');
}

function hmacSha256Base64url(key, data) {
	return createHmac('sha256', key).update(data).digest('base64url');
}

function signArbitraryPayload(payload, secret, version = IDE_TOKEN_VERSION) {
	const encodedPayload = base64url(JSON.stringify(payload));
	const signature = hmacSha256Base64url(secret, `${version}.${encodedPayload}`);
	return `${version}.${encodedPayload}.${signature}`;
}

// Helper to create a preview cap with arbitrary payload (for forging)
function signArbitraryPreviewCap(payload, secret) {
	const previewKey = createHmac('sha256', secret).update('osio-ide-preview-v1').digest();
	const encodedPayload = base64url(JSON.stringify(payload));
	const signature = hmacSha256Base64url(previewKey, `${PREVIEW_CAP_VERSION}.${encodedPayload}`);
	return `${PREVIEW_CAP_VERSION}.${encodedPayload}.${signature}`;
}

// --- ideTokenSecret tests ---

describe('ideTokenSecret', () => {
	it('throws 503 when unset', () => {
		assert.throws(() => ideTokenSecret({}), { status: 503, message: 'The IDE token secret is not configured.' });
	});

	it('throws 503 when empty string', () => {
		assert.throws(() => ideTokenSecret({ OSIONOS_IDE_TOKEN_SECRET: '' }), { status: 503 });
	});

	it('throws 503 when shorter than 32 bytes', () => {
		const short = 'x'.repeat(31);
		assert.throws(() => ideTokenSecret({ OSIONOS_IDE_TOKEN_SECRET: short }), { status: 503 });
	});

	it('throws 503 when equal to OSIONOS_APP_SESSION_SECRET', () => {
		assert.throws(() => ideTokenSecret({ OSIONOS_IDE_TOKEN_SECRET: APP_SECRET, OSIONOS_APP_SESSION_SECRET: APP_SECRET }), { status: 503 });
	});

	it('returns the secret when 32 bytes and different from app secret', () => {
		const result = ideTokenSecret({ OSIONOS_IDE_TOKEN_SECRET: TEST_SECRET, OSIONOS_APP_SESSION_SECRET: APP_SECRET });
		assert.equal(result, TEST_SECRET);
	});
});

// --- Round trip tests ---

describe('signIdeToken / verifyIdeToken round trip', () => {
	it('sign then verify returns correct shape with 900s TTL', () => {
		const { token, exp } = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW });
		const verified = verifyIdeToken(token, { secret: TEST_SECRET }, NOW);
		assert.equal(verified.userId, USER_ID);
		assert.deepEqual(verified.workspaceIds, [WORKSPACE_ID]);
		assert.equal(verified.exp - NOW_SEC, 900);
		assert.deepEqual(verified.roles, {});
		assert.equal(verified.isAdmin, false);
		assert.equal(exp, NOW_SEC + 900);
	});

	it('ttlSeconds: 3600 is capped to 900', () => {
		const { exp } = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW, ttlSeconds: 3600 });
		assert.equal(exp, NOW_SEC + 900);
	});

	it('ttlSeconds: 60 gives 60', () => {
		const { exp } = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW, ttlSeconds: 60 });
		assert.equal(exp, NOW_SEC + 60);
	});
});

// --- Refusal tests ---

describe('verifyIdeToken refusals', () => {
	const validToken = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW }).token;

	it('refuses an osionos_v1 app token', () => {
		const config = configFromEnv({
			OSIONOS_APP_SESSION_SECRET: TEST_SECRET,
		});
		const appToken = signAppSessionToken({
			payload: { provider: 'prismatica', subject: USER_ID, email: 'a@b.c', name: 'A', jti: '11111111-1111-4111-8111-111111111111' },
			workspace: { _id: WORKSPACE_ID },
			config,
			now: NOW,
		}).token;
		assert.throws(() => verifyIdeToken(appToken, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses wrong aud', () => {
		const payload = { iss: 'osionos-bridge', aud: 'wrong', sub: USER_ID, ws: WORKSPACE_ID, iat: NOW_SEC, exp: NOW_SEC + 900, jti: '11111111-1111-4111-8111-111111111111' };
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses wrong iss', () => {
		const payload = { iss: 'wrong', aud: 'osionos-ide', sub: USER_ID, ws: WORKSPACE_ID, iat: NOW_SEC, exp: NOW_SEC + 900, jti: '11111111-1111-4111-8111-111111111111' };
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses 2 parts', () => {
		assert.throws(() => verifyIdeToken('osionos_ide1.payload', { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses 4 parts', () => {
		assert.throws(() => verifyIdeToken('osionos_ide1.payload.sig.extra', { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses empty part', () => {
		assert.throws(() => verifyIdeToken('osionos_ide1..sig', { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses non-UUID sub', () => {
		const payload = { iss: 'osionos-bridge', aud: 'osionos-ide', sub: 'not-a-uuid', ws: WORKSPACE_ID, iat: NOW_SEC, exp: NOW_SEC + 900, jti: '11111111-1111-4111-8111-111111111111' };
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses non-UUID ws', () => {
		const payload = { iss: 'osionos-bridge', aud: 'osionos-ide', sub: USER_ID, ws: 'not-a-uuid', iat: NOW_SEC, exp: NOW_SEC + 900, jti: '11111111-1111-4111-8111-111111111111' };
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses expired token', () => {
		const payload = { iss: 'osionos-bridge', aud: 'osionos-ide', sub: USER_ID, ws: WORKSPACE_ID, iat: NOW_SEC - 1000, exp: NOW_SEC - 100, jti: '11111111-1111-4111-8111-111111111111' };
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token has expired.' });
	});

	it('refuses iat one second in the future', () => {
		const payload = { iss: 'osionos-bridge', aud: 'osionos-ide', sub: USER_ID, ws: WORKSPACE_ID, iat: NOW_SEC + 1, exp: NOW_SEC + 900, jti: '11111111-1111-4111-8111-111111111111' };
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses exp - iat === 901', () => {
		const payload = { iss: 'osionos-bridge', aud: 'osionos-ide', sub: USER_ID, ws: WORKSPACE_ID, iat: NOW_SEC, exp: NOW_SEC + 901, jti: '11111111-1111-4111-8111-111111111111' };
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses one changed signature character', () => {
		const tampered = validToken.slice(0, -1) + (validToken.slice(-1) === 'A' ? 'B' : 'A');
		assert.throws(() => verifyIdeToken(tampered, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses payload as array', () => {
		const payload = ['not', 'an', 'object'];
		const token = signArbitraryPayload(payload, TEST_SECRET);
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses a correctly signed payload that is not JSON', () => {
		const payloadPart = base64url('not json');
		const token = `${IDE_TOKEN_VERSION}.${payloadPart}.${hmacSha256Base64url(TEST_SECRET, `${IDE_TOKEN_VERSION}.${payloadPart}`)}`;
		assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses a string iat, an array sub and a string exp, even when signed', () => {
		const base = { iss: 'osionos-bridge', aud: 'osionos-ide', sub: USER_ID, ws: WORKSPACE_ID, iat: NOW_SEC, exp: NOW_SEC + 900, jti: 'j' };
		for (const patch of [{ iat: String(NOW_SEC) }, { sub: [USER_ID] }, { exp: String(NOW_SEC + 900) }]) {
			const token = signArbitraryPayload({ ...base, ...patch }, TEST_SECRET);
			assert.throws(() => verifyIdeToken(token, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
		}
	});

	it('refuses another spelling of a valid signature', () => {
		for (const spelled of [`${validToken}=`, `${validToken}!`, validToken.replace(/\.([^.]*)$/, '.!$1')]) {
			assert.throws(() => verifyIdeToken(spelled, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
		}
	});

	it('refuses 5000-char string', () => {
		const long = 'x'.repeat(5000);
		assert.throws(() => verifyIdeToken(long, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('refuses undefined', () => {
		assert.throws(() => verifyIdeToken(undefined, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});
});

// --- Cross-verification ---

describe('Cross-verification between IDE token and app token', () => {
	it('verifyAppSessionToken refuses an IDE token', () => {
		const config = configFromEnv({ OSIONOS_APP_SESSION_SECRET: TEST_SECRET });
		const ideToken = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW }).token;
		assert.throws(() => verifyAppSessionToken(ideToken, config, NOW), { status: 401, message: 'App session token is invalid.' });
	});

	it('verifyIdeToken refuses an app token', () => {
		const config = configFromEnv({ OSIONOS_APP_SESSION_SECRET: TEST_SECRET });
		const appToken = signAppSessionToken({
			payload: { provider: 'prismatica', subject: USER_ID, email: 'a@b.c', name: 'A', jti: '11111111-1111-4111-8111-111111111111' },
			workspace: { _id: WORKSPACE_ID },
			config,
			now: NOW,
		}).token;
		assert.throws(() => verifyIdeToken(appToken, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});
});

// --- Preview cap tests ---

describe('signPreviewCap / verifyPreviewCap round trip', () => {
	it('returns correct shape', () => {
		const { cap, exp } = signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 3000, secret: TEST_SECRET, parentExp: NOW_SEC + 900, now: NOW });
		const verified = verifyPreviewCap(cap, { secret: TEST_SECRET }, NOW);
		assert.equal(verified.userId, USER_ID);
		assert.equal(verified.workspaceId, WORKSPACE_ID);
		assert.equal(verified.port, 3000);
		assert.equal(verified.exp, exp);
	});

	it('exp === parentExp when parent expires sooner than 900s', () => {
		const parentExp = NOW_SEC + 100;
		const { cap, exp } = signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 3000, secret: TEST_SECRET, parentExp, now: NOW });
		assert.equal(exp, parentExp);
		const verified = verifyPreviewCap(cap, { secret: TEST_SECRET }, NOW);
		assert.equal(verified.exp, parentExp);
	});

	it('signPreviewCap with parentExp <= nowSec throws 401', () => {
		assert.throws(
			() => signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 3000, secret: TEST_SECRET, parentExp: NOW_SEC, now: NOW }),
			{ status: 401, message: 'Preview link has expired.' }
		);
	});
});

describe('verifyPreviewCap refusals', () => {
	const validCap = signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 3000, secret: TEST_SECRET, parentExp: NOW_SEC + 900, now: NOW }).cap;

	it('a cap passed to verifyIdeToken → 401', () => {
		assert.throws(() => verifyIdeToken(validCap, { secret: TEST_SECRET }, NOW), { status: 401, message: 'IDE token is invalid.' });
	});

	it('an IDE token passed to verifyPreviewCap → 401', () => {
		const ideToken = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW }).token;
		assert.throws(() => verifyPreviewCap(ideToken, { secret: TEST_SECRET }, NOW), { status: 401, message: 'Preview link is invalid.' });
	});

	it('cap with port changed (re-encoded, old MAC) → 401', () => {
		// Decode, modify port, re-encode with old signature
		const parts = validCap.split('.');
		const payload = JSON.parse(base64urlDecode(parts[1]));
		payload.port = 4000;
		const forged = `${PREVIEW_CAP_VERSION}.${base64url(JSON.stringify(payload))}.${parts[2]}`;
		assert.throws(() => verifyPreviewCap(forged, { secret: TEST_SECRET }, NOW), { status: 401, message: 'Preview link is invalid.' });
	});

	it('expired cap → 410', () => {
		const cap = signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 3000, secret: TEST_SECRET, parentExp: NOW_SEC - 100, now: NOW - 200_000 }).cap;
		assert.throws(() => verifyPreviewCap(cap, { secret: TEST_SECRET }, NOW), { status: 410, message: 'Preview link has expired.' });
	});

	it('port 0 → 400 at sign', () => {
		assert.throws(() => signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 0, secret: TEST_SECRET, parentExp: NOW_SEC + 900, now: NOW }), { status: 400 });
	});

	it('port 65536 → 400 at sign', () => {
		assert.throws(() => signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 65536, secret: TEST_SECRET, parentExp: NOW_SEC + 900, now: NOW }), { status: 400 });
	});

	it('port 80.5 → 400 at sign', () => {
		assert.throws(() => signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 80.5, secret: TEST_SECRET, parentExp: NOW_SEC + 900, now: NOW }), { status: 400 });
	});
});

// --- signIdeToken input validation ---

describe('signIdeToken input validation', () => {
	it('non-UUID userId throws 400', () => {
		assert.throws(() => signIdeToken({ userId: 'not-uuid', workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW }), { status: 400 });
	});

	it('non-UUID workspaceId throws 400', () => {
		assert.throws(() => signIdeToken({ userId: USER_ID, workspaceId: 'not-uuid', secret: TEST_SECRET, now: NOW }), { status: 400 });
	});

	it('non-finite ttlSeconds defaults to 900', () => {
		const { exp } = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW, ttlSeconds: NaN });
		assert.equal(exp, NOW_SEC + 900);
	});

	it('ttlSeconds < 1 clamps to 1', () => {
		const { exp } = signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret: TEST_SECRET, now: NOW, ttlSeconds: 0 });
		assert.equal(exp, NOW_SEC + 1);
	});
});

describe('signing keys', () => {
	it('an empty, short or missing key is refused with 503 at sign and at verify', () => {
		for (const secret of ['', 'x'.repeat(31), undefined]) {
			assert.throws(() => signIdeToken({ userId: USER_ID, workspaceId: WORKSPACE_ID, secret, now: NOW }), { status: 503 });
			assert.throws(() => verifyIdeToken('a.b.c', { secret }, NOW), { status: 503 });
			assert.throws(() => signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 3000, secret, parentExp: NOW_SEC + 60, now: NOW }), { status: 503 });
			assert.throws(() => verifyPreviewCap('a.b.c', { secret }, NOW), { status: 503 });
		}
	});

	it('the cap key is HMAC(secret, "osio-ide-preview-v1"): an independently built cap verifies, one MACd with the raw secret does not', () => {
		const payload = { sub: USER_ID, ws: WORKSPACE_ID, port: 3000, exp: NOW_SEC + 60 };
		assert.equal(verifyPreviewCap(signArbitraryPreviewCap(payload, TEST_SECRET), { secret: TEST_SECRET }, NOW).port, 3000);
		const rawKeyed = signArbitraryPayload(payload, TEST_SECRET, PREVIEW_CAP_VERSION);
		assert.throws(() => verifyPreviewCap(rawKeyed, { secret: TEST_SECRET }, NOW), { status: 401, message: 'Preview link is invalid.' });
	});

	it('a preview cap with a string port is refused even when signed', () => {
		const cap = signArbitraryPreviewCap({ sub: USER_ID, ws: WORKSPACE_ID, port: '3000', exp: NOW_SEC + 60 }, TEST_SECRET);
		assert.throws(() => verifyPreviewCap(cap, { secret: TEST_SECRET }, NOW), { status: 401, message: 'Preview link is invalid.' });
	});

	it('a missing parentExp refuses the cap instead of minting one without a bound', () => {
		assert.throws(() => signPreviewCap({ userId: USER_ID, workspaceId: WORKSPACE_ID, port: 3000, secret: TEST_SECRET, now: NOW }), { status: 401 });
	});
});
