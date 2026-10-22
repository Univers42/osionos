/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-guard.test.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pin the trust boundary: one configured header, a keyed hash, per-session sudo and an
// audit write that must succeed before the action it records.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { clientMeta, grantSudo, rateLimit, requireSudo, writeAudit } from '../../scripts/bridge-guard.mjs';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const JTI_A = '33333333-3333-4333-8333-333333333333';
const JTI_B = '44444444-4444-4444-8444-444444444444';
const JTI_C = '55555555-5555-4555-8555-555555555555';
const SESSION_A = { userId: USER_A, raw: { jti: JTI_A } };
const SESSION_B = { userId: USER_A, raw: { jti: JTI_B } };
const SESSION_C = { userId: USER_A, raw: { jti: JTI_C } };
const fail = (status, code) => (error) => error?.status === status && error?.code === code;
const metaOf = (headers, ipHeader = 'x-real-ip', hashSecret = 'secret') => clientMeta(
	{ headers, socket: { remoteAddress: '203.0.113.9' } },
	{ ipHeader, hashSecret },
);

describe('clientMeta', () => {
	it('normalises the three canonical prefixes', () => {
		const vectors = [
			['2001:db8::1', '2001:db8::/48'],
			['::1', '::/48'],
			['::ffff:10.1.2.3', '10.1.2.0/24'],
		];
		for (const [address, prefix] of vectors) {
			assert.equal(metaOf({ 'x-real-ip': address }).ipPrefix, prefix);
		}
	});

	it('returns no IP for garbage, a merged header or an unparseable socket address', () => {
		for (const address of ['not-an-ip', 'a, b', '2001:db8::1::2']) {
			const meta = metaOf({ 'x-real-ip': address });
			assert.deepEqual([meta.ipPrefix, meta.ipHash], [null, null]);
		}
		const socketMeta = clientMeta({ headers: {}, socket: { remoteAddress: 'nonsense' } }, { hashSecret: 'secret' });
		assert.deepEqual([socketMeta.ipPrefix, socketMeta.ipHash], [null, null]);
	});

	it('strips the zone and reads only the configured header', () => {
		assert.equal(metaOf({ 'x-real-ip': 'fe80::1%eth0' }).ipPrefix, 'fe80::/48');
		const spoofed = metaOf({ 'x-real-ip': '10.9.9.9', 'x-forwarded-for': '203.0.113.5' });
		assert.equal(spoofed.ipPrefix, '10.9.9.0/24');
	});

	it('never falls back to the socket when the configured header is missing', () => {
		const meta = metaOf({ 'x-forwarded-for': '203.0.113.5' });
		assert.deepEqual([meta.ipPrefix, meta.ipHash], [null, null]);
	});

	it('uses the socket address when no header is configured', () => {
		const meta = clientMeta({ headers: {}, socket: { remoteAddress: '198.51.100.7' } }, { hashSecret: 'secret' });
		assert.equal(meta.ipPrefix, '198.51.100.0/24');
	});

	it('hashes with the secret and refuses an unkeyed hash', () => {
		const expected = createHmac('sha256', 'secret').update('osb:ip:2001:db8::1').digest('hex');
		assert.equal(metaOf({ 'x-real-ip': '2001:db8::1' }).ipHash, expected);
		for (const hashSecret of ['', '   ', null]) {
			assert.equal(metaOf({ 'x-real-ip': '2001:db8::1' }, 'x-real-ip', hashSecret).ipHash, null);
		}
		assert.equal(clientMeta({ headers: { 'x-real-ip': '2001:db8::1' } }, { ipHeader: 'x-real-ip' }).ipHash, null);
	});

	it('strips control characters and truncates the user agent by code point', () => {
		assert.equal(metaOf({ 'x-real-ip': '10.1.2.3' }).userAgent, null);
		assert.equal(metaOf({ 'x-real-ip': '10.1.2.3', 'user-agent': 'a\u0000b' }).userAgent, 'ab');
		const long = metaOf({ 'x-real-ip': '10.1.2.3', 'user-agent': '😀'.repeat(300) }).userAgent;
		assert.equal(Array.from(long).length, 256);
		assert.equal(long.includes('\uFFFD'), false);
	});
});

describe('rateLimit', () => {
	it('allows the limit then throws a 429 with the window as retry-after', async () => {
		const kv = createKv({});
		const options = { limit: 2, windowMs: 1_500 };
		await rateLimit(kv, ['login', 'abcd'], options);
		await rateLimit(kv, ['login', 'abcd'], options);
		await assert.rejects(
			rateLimit(kv, ['login', 'abcd'], options),
			(error) => fail(429, 'rate_limited')(error) && error.retryAfterSeconds === 2,
		);
		assert.equal(await kv.get('rl:login:abcd'), '3');
		kv.close();
	});

	it('accepts an IPv6 prefix and encodes it into the stored key', async () => {
		const kv = createKv({});
		const options = { limit: 1, windowMs: 1_000 };
		await rateLimit(kv, ['login', '2001:db8::/48'], options);
		assert.equal(await kv.get('rl:login:2001%3Adb8%3A%3A%2F48'), '1');
		await assert.rejects(rateLimit(kv, ['login', '2001:db8::/48'], options), fail(429, 'rate_limited'));
		kv.close();
	});

	it('keeps one part with a colon distinct from two parts', async () => {
		const kv = createKv({});
		const options = { limit: 1, windowMs: 1_000 };
		await rateLimit(kv, ['a:b'], options);
		await rateLimit(kv, ['a', 'b'], options);
		await assert.rejects(rateLimit(kv, ['a:b'], options), fail(429, 'rate_limited'));
		kv.close();
	});

	it('refuses an empty part list or a non-string part without a string heuristic', async () => {
		const kv = createKv({});
		const options = { limit: 1, windowMs: 1_000 };
		for (const parts of [[], ['login', ''], ['login', null], ['login', undefined], ['login', 7], 'login:abcd']) {
			await assert.rejects(rateLimit(kv, parts, options), TypeError);
		}
		await rateLimit(kv, ['login', 'null'], options);
		kv.close();
	});

	it('passes a kv 503 through unchanged', async () => {
		const down = { incrWithTtl: async () => { throw Object.assign(new Error('down'), { status: 503, code: 'kv_unavailable' }); } };
		await assert.rejects(rateLimit(down, ['login', 'abcd'], { limit: 1, windowMs: 1_000 }), fail(503, 'kv_unavailable'));
	});
});

describe('sudo grants', () => {
	it('binds a grant to one session jti and one user', async () => {
		const kv = createKv({});
		await grantSudo(kv, SESSION_A, 5_000);
		assert.equal(await kv.get(`sudo:${JTI_A}`), USER_A);
		await requireSudo(kv, SESSION_A);
		await assert.rejects(requireSudo(kv, SESSION_B), fail(403, 'sudo_required'));
		await kv.set(`sudo:${JTI_B}`, USER_B, 5_000);
		await assert.rejects(requireSudo(kv, SESSION_B), fail(403, 'sudo_required'));
		kv.close();
	});

	it('writes nothing for a non-uuid jti', async () => {
		const kv = createKv({});
		const legacy = { userId: USER_A, raw: { jti: 'legacy-session' } };
		await assert.rejects(grantSudo(kv, legacy), fail(403, 'sudo_required'));
		await assert.rejects(requireSudo(kv, legacy), fail(403, 'sudo_required'));
		assert.equal(await kv.get('sudo:legacy-session'), null);
		assert.equal(await kv.get('sudo:undefined'), null);
		kv.close();
	});

	it('cannot be created through the rate-limit key space', async () => {
		const kv = createKv({});
		await rateLimit(kv, ['sudo', JTI_C], { limit: 5, windowMs: 1_000 });
		await assert.rejects(requireSudo(kv, SESSION_C), fail(403, 'sudo_required'));
		kv.close();
	});
});

function pgRecorder() {
	const calls = [];
	return {
		calls,
		pg: {
			asService: () => ({
				post: async (path, row, options) => { calls.push({ path, row, options }); },
			}),
		},
	};
}

describe('writeAudit', () => {
	it('sends exactly the audit columns with return=minimal', async () => {
		const { calls, pg } = pgRecorder();
		const meta = { ipHash: 'a'.repeat(64), userAgent: 'test-agent' };
		const details = { reason: 'rotation' };
		await writeAudit(pg, { session: SESSION_A, meta, eventType: 'handoff.consume', details });
		assert.deepEqual(calls, [{
			path: 'osionos_bridge_audit_events',
			row: {
				provider: 'osionos', subject: USER_A, actor_id: USER_A, session_id: JTI_A,
				ip_hash: 'a'.repeat(64), user_agent: 'test-agent', event_type: 'handoff.consume', details,
			},
			options: { prefer: 'return=minimal' },
		}]);
	});

	it('drops a non-uuid jti and defaults details to an empty object', async () => {
		const { calls, pg } = pgRecorder();
		await writeAudit(pg, { session: { userId: USER_A, raw: { jti: 'legacy' } }, meta: {}, eventType: 'login' });
		assert.equal(calls[0].row.session_id, null);
		assert.deepEqual(calls[0].row.details, {});
	});

	it('turns an unconfigured or failing service client into audit_unavailable with a cause', async () => {
		const params = { session: SESSION_A, meta: {}, eventType: 'login' };
		const unconfigured = new Error('unconfigured');
		const failed = new Error('boom');
		await assert.rejects(
			writeAudit({ asService() { throw unconfigured; } }, params),
			(error) => fail(503, 'audit_unavailable')(error) && error.cause === unconfigured,
		);
		await assert.rejects(
			writeAudit({ asService: () => ({ post: async () => { throw failed; } }) }, params),
			(error) => fail(503, 'audit_unavailable')(error) && error.cause === failed,
		);
	});

	it('refuses a non-uuid subject and hostile details', async () => {
		const { calls, pg } = pgRecorder();
		const params = { session: SESSION_A, meta: {}, eventType: 'login' };
		await assert.rejects(writeAudit(pg, { ...params, session: { userId: 'admin', raw: {} } }), TypeError);
		await assert.rejects(writeAudit(pg, { ...params, details: [] }), TypeError);
		await assert.rejects(writeAudit(pg, { ...params, details: { blob: 'a'.repeat(2_048) } }), TypeError);
		await assert.rejects(writeAudit(pg, { ...params, eventType: '' }), TypeError);
		assert.equal(calls.length, 0);
	});
});
