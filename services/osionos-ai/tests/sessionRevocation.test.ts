import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { POLL_INTERVAL_MS } from '../../../scripts/bridge-session-revocations.mjs';

/**
 * #57: a session revoked in the account plane kept reaching the AI service until its
 * token expired — the bridge refused it, this service had no revocation set at all.
 *
 * The suite runs with OSIONOS_SESSION_RECORDS=off; this file turns it on and points
 * the service at a BaaS stub, so the real poller loads public.osionos_sessions the
 * way it does live. The env is read when config.ts loads, hence the dynamic import.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVOKED_JTI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_JTI = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** What the stub BaaS answers for the revoked sessions; the test flips it. */
let revokedRows: { id: string; expires_at: string }[] = [];
let sessionReads = 0;

const baas = createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://baas.test');
	if (url.pathname !== '/rest/v1/osionos_sessions') {
		response.writeHead(404).end();
		return;
	}
	sessionReads += 1;
	const total = revokedRows.length;
	response.writeHead(200, {
		'content-type': 'application/json',
		'content-range': total ? `0-${total - 1}/${total}` : '*/0',
	});
	response.end(JSON.stringify(revokedRows));
});
await new Promise<void>((resolve) => baas.listen(0, '127.0.0.1', () => resolve()));

process.env.OSIONOS_SESSION_RECORDS = 'on';
process.env.OSIONOS_BAAS_URL = `http://127.0.0.1:${(baas.address() as AddressInfo).port}`;
const { createAiServer } = await import('../src/server.ts');

const app = createAiServer();
await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', () => resolve()));
const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

after(async () => {
	await app.close();
	await new Promise<void>((resolve) => baas.close(() => resolve()));
});

function tokenFor(jti: string): string {
	return signAppSessionToken({
		payload: { subject: USER, provider: 'test' },
		workspace: { _id: WORKSPACE },
		config: { appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '', sessionTtlSeconds: 3600 },
		jti,
	}).token;
}

async function usage(token: string): Promise<{ status: number; code: unknown }> {
	const response = await fetch(`${base}/api/ai/usage`, { headers: { authorization: `Bearer ${token}` } });
	const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
	return { status: response.status, code: body?.code };
}

/** Asks every 250 ms until `done` holds or `withinMs` runs out; the last answer either way. */
async function pollUntil(token: string, done: (answer: { status: number }) => boolean, withinMs: number) {
	const deadline = Date.now() + withinMs;
	for (;;) {
		const answer = await usage(token);
		if (done(answer) || Date.now() > deadline) return answer;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

describe('a session revoked in the account plane', () => {
	it('answers 401 session_revoked from an AI route within the poll interval', async () => {
		const token = tokenFor(REVOKED_JTI);
		// The first load runs at boot; until it lands the set is not fresh.
		assert.equal((await pollUntil(token, (answer) => answer.status === 200, 5_000)).status, 200);

		revokedRows = [{ id: REVOKED_JTI, expires_at: new Date(Date.now() + 3_600_000).toISOString() }];
		const revokedAt = Date.now();
		const answer = await pollUntil(token, (seen) => seen.status !== 200, POLL_INTERVAL_MS + 3_000);

		assert.deepEqual(answer, { status: 401, code: 'session_revoked' });
		assert.ok(Date.now() - revokedAt <= POLL_INTERVAL_MS + 3_000, `refused after ${Date.now() - revokedAt} ms`);
		assert.ok(sessionReads >= 2, 'the service polls public.osionos_sessions');
	});

	it('leaves the same user\'s other sessions working', async () => {
		assert.equal((await usage(tokenFor(OTHER_JTI))).status, 200);
	});
});
