import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { expiresAtMsOf, verifyRequest } from '../src/auth.ts';
import { CREDENTIAL_MARGIN_MS, makeRunCredential } from '../src/modes/credential.ts';

const SECRET_TOKEN = 'tok-SECRET-abc123';
const NOW = 1_800_000_000_000;

describe('run credential (AM1)', () => {
	it('is null for an empty token or an unknown expiry', () => {
		assert.equal(makeRunCredential('', NOW + 3_600_000), null);
		assert.equal(makeRunCredential('x', null), null);
	});

	it('is unusable inside the margin (8 s bridge timeout + 30 s) and usable outside it', () => {
		assert.equal(CREDENTIAL_MARGIN_MS, 38_000);
		assert.equal(makeRunCredential('x', NOW + 37_000)!.usable(NOW), false);
		assert.equal(makeRunCredential('x', NOW + CREDENTIAL_MARGIN_MS)!.usable(NOW), false);
		assert.equal(makeRunCredential('x', NOW + CREDENTIAL_MARGIN_MS + 1)!.usable(NOW), true);
	});

	it('never shows the token when serialised or stringified', () => {
		const credential = makeRunCredential(SECRET_TOKEN, NOW + 3_600_000)!;
		assert.equal(JSON.stringify({ credential }).includes(SECRET_TOKEN), false);
		assert.equal(`${credential}`.includes(SECRET_TOKEN), false);
		assert.equal(`${credential}`, '[credential]');
		assert.equal(JSON.stringify(Object.values(credential).map(String)).includes(SECRET_TOKEN), false);
	});

	it('hands the exact token to use()', async () => {
		const credential = makeRunCredential(SECRET_TOKEN, NOW + 3_600_000)!;
		assert.equal(await credential.use(async (token) => token), SECRET_TOKEN);
	});
});

describe('AuthUser.expiresAtMs', () => {
	it('is exp * 1000 for a verified token', () => {
		const signed = signAppSessionToken({
			payload: { subject: '11111111-1111-4111-8111-111111111111', provider: 'test' },
			workspace: { _id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
			config: { appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '', sessionTtlSeconds: 3600 },
		});
		const request = { headers: { authorization: `Bearer ${signed.token}` } } as unknown as IncomingMessage;
		const { user } = verifyRequest(request);
		assert.ok(user);
		assert.equal(user.expiresAtMs, Date.parse(signed.expiresAt));
	});

	it('is null when exp is not a number', () => {
		for (const exp of [null, '', false, '1800000000', undefined, Number.NaN]) {
			assert.equal(expiresAtMsOf({ raw: { exp } } as never), null);
		}
	});
});
