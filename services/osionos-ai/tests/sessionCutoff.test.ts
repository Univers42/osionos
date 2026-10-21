import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { sessionCutoffsFromConfig } from '../../../scripts/bridge-session-cutoff.mjs';
import type { SessionCutoffTracker } from '../../../scripts/bridge-session-cutoff.mjs';
import { createAiServer } from '../src/server.ts';
import { setSessionCutoffs } from '../src/auth.ts';

/**
 * C128: the 401 of a revoked token reaches the client with the code it needs.
 *
 * The suite runs with OSIONOS_SESSION_CUTOFFS=off, so the tracker's own table
 * is never read and the cut-off is put in place by the test: a tracker loaded
 * with the cut-off of the user, exactly as the poller would load it.
 */

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type JsonBody = Record<string, unknown>;

/** A token the way the bridge signs one: the same module, the test's secret. */
function tokenFor(issuedAtMs: number, secret = APP_SECRET): string {
	return signAppSessionToken({
		payload: { subject: USER, provider: 'test' },
		workspace: { _id: WORKSPACE },
		config: { appSessionSecret: secret, sessionTtlSeconds: 3600 },
		now: issuedAtMs,
	}).token;
}

const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

after(async () => {
	await app.close();
});

async function call(token?: string): Promise<{ status: number; body: JsonBody | null }> {
	const response = await fetch(`${base}/api/ai/conversations`, {
		method: 'POST',
		headers: {
			...(token ? { authorization: `Bearer ${token}` } : {}),
			'content-type': 'application/json',
		},
		body: JSON.stringify({ workspaceId: WORKSPACE }),
	});
	const text = await response.text();
	return { status: response.status, body: text ? (JSON.parse(text) as JsonBody) : null };
}

/** A tracker the poller would have filled: the cut-off of one user, in microseconds. */
function trackerWith(cutoffMicros: Map<string, number>): SessionCutoffTracker {
	const tracker = sessionCutoffsFromConfig(
		{ sessionCutoffsMode: 'on', serviceKey: 'test', baasUrl: 'http://baas.test' },
		{ log: { info: () => {}, warn: () => {} } },
	);
	tracker.completeLoad(cutoffMicros, tracker.beginLoad());
	return tracker;
}

describe('a revoked session', () => {
	it('answers 401 session_revoked when the cut-off is after the token was issued', async () => {
		const issuedAt = Date.now() - 60_000;
		setSessionCutoffs(trackerWith(new Map([[USER, (issuedAt + 5_000) * 1000]])));
		const answer = await call(tokenFor(issuedAt));
		assert.equal(answer.status, 401);
		assert.equal(answer.body?.code, 'session_revoked');
	});

	it('lets a token issued after the cut-off through', async () => {
		const issuedAt = Date.now();
		setSessionCutoffs(trackerWith(new Map([[USER, (issuedAt - 5_000) * 1000]])));
		const answer = await call(tokenFor(issuedAt));
		assert.equal(answer.status, 201);
	});

	it('answers 401 unauthorized for a token signed with another secret', async () => {
		const issuedAt = Date.now();
		setSessionCutoffs(trackerWith(new Map([[USER, (issuedAt + 5_000) * 1000]])));
		const answer = await call(tokenFor(issuedAt, 'another-secret'));
		assert.equal(answer.status, 401);
		assert.equal(answer.body?.code, 'unauthorized');
	});

	it('answers 401 unauthorized for an expired token', async () => {
		const issuedAt = Date.now() - 7_200_000;
		setSessionCutoffs(trackerWith(new Map([[USER, (issuedAt + 5_000) * 1000]])));
		const answer = await call(tokenFor(issuedAt));
		assert.equal(answer.status, 401);
		assert.equal(answer.body?.code, 'unauthorized');
	});
});
