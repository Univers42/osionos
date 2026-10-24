/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-otp.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The OTP client in isolation: the proof checks, the single-use spend, the grobase
 * status mappings, and that one client yields each flow's own error codes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOtpClient } from '../../scripts/bridge-account-otp.mjs';
import { OTP_SECRET, createOtpService, otpProof } from './support/account-otp.mjs';

const fail = (status, code, message, extra) => Object.assign(new Error(message), { status, code }, extra);
const SUDO = { unavailable: 'sudo_unavailable', proofInvalid: 'sudo_proof_invalid' };
const MAIL = { unavailable: 'email_unavailable', proofInvalid: 'email_proof_invalid' };
const ADDRESS = 'member@example.com';
const NOW = Date.UTC(2026, 9, 24);
const config = { baasUrl: 'http://grobase.test', serviceKey: 'service' };
const client = createOtpClient({ fail, codes: SUDO });
const check = (proof, address = ADDRESS) => client.checkProof(proof, { secret: OTP_SECRET, address, now: NOW });
const kvOf = () => {
	const seen = new Map();
	return { seen, setNx: async (key, value, ttl) => (seen.has(key) ? false : (seen.set(key, ttl), true)) };
};
const failure = async (promise) => promise.then(() => null, (error) => error);

describe('bridge-account-otp', () => {
	it('O1 checks alg, signature, audience, expiry and address', () => {
		const good = otpProof({ email: ADDRESS, now: NOW });
		assert.equal(check(good).exp, Math.floor(NOW / 1000) + 300);
		assert.ok(check(good, 'MEMBER@example.com'), 'the address compares case-insensitively');
		const broken = {
			'another secret': otpProof({ email: ADDRESS, now: NOW, secret: 'other' }),
			'alg none': otpProof({ email: ADDRESS, now: NOW, alg: 'none' }),
			'alg HS512': otpProof({ email: ADDRESS, now: NOW, alg: 'HS512' }),
			'another audience': otpProof({ email: ADDRESS, now: NOW, aud: 'login' }),
			expired: otpProof({ email: ADDRESS, now: NOW, expOffsetSeconds: -1 }),
			'another address': otpProof({ email: 'other@example.com', now: NOW }),
			'not a jwt': 'abc',
			empty: '',
		};
		for (const [name, proof] of Object.entries(broken)) assert.equal(check(proof), null, name);
	});

	it('O2 spends a proof once under the otp-proof: marker', async () => {
		const kv = kvOf();
		const proof = otpProof({ email: ADDRESS, now: NOW });
		const seen = [];
		await client.spendProof(kv, proof, check(proof), NOW, async (fresh) => { seen.push(fresh); });
		const second = await failure(client.spendProof(kv, proof, check(proof), NOW, async (fresh) => { seen.push(fresh); }));
		assert.deepEqual(seen, [true, false]);
		assert.equal(second.code, 'sudo_proof_invalid');
		assert.equal(second.status, 502);
		assert.equal([...kv.seen.keys()].length, 1);
		assert.match([...kv.seen.keys()][0], /^otp-proof:[0-9a-f]{64}$/);
		assert.equal((await failure(client.spendProof(kvOf(), proof, null, NOW))).code, 'sudo_proof_invalid', 'an unchecked proof is never spent');
		const down = { setNx: async () => { throw new Error('kv down'); } };
		assert.equal((await failure(client.spendProof(down, proof, check(proof), NOW))).code, 'sudo_unavailable');
	});

	it('O3 maps grobase answers and passes Kong\'s retry-after through', async () => {
		const via = (options, run) => run({ config, fetchImpl: createOtpService(options).fetchImpl });
		const verify = (options) => failure(via(options, (deps) => client.verifyCode(deps, ADDRESS, '123456')));
		for (const [status, code, http] of [[401, 'code_invalid', 422], [410, 'code_expired', 410], [429, 'code_locked', 429], [500, 'sudo_unavailable', 503]]) {
			const error = await verify({ verifyStatus: status });
			assert.deepEqual([error.status, error.code], [http, code], String(status));
		}
		const throttled = await failure(via({ requestStatus: 429, requestHeaders: { 'retry-after': '42' } }, (deps) => client.requestCode(deps, ADDRESS)));
		assert.deepEqual([throttled.status, throttled.code, throttled.retryAfterSeconds], [503, 'sudo_unavailable', 42]);
		assert.equal((await failure(via({ network: true }, (deps) => client.requestCode(deps, ADDRESS)))).code, 'sudo_unavailable');
		assert.equal((await failure(via({ requestBody: { sent: false } }, (deps) => client.requestCode(deps, ADDRESS)))).code, 'sudo_unavailable');
		assert.equal(await via({}, (deps) => client.requestCode(deps, ADDRESS)), undefined);
		assert.match(await via({ email: ADDRESS, now: () => NOW }, (deps) => client.verifyCode(deps, ADDRESS, '123456')), /^[\w-]+\.[\w-]+\.[\w-]+$/);
	});

	it('O4 the same client under two code sets differs only in the codes', async () => {
		const mail = createOtpClient({ fail, codes: MAIL });
		const outcomes = async (c) => {
			const deps = { config, fetchImpl: createOtpService({ network: true }).fetchImpl };
			const proof = otpProof({ email: ADDRESS, now: NOW });
			const spent = await failure(c.spendProof(kvOf(), proof, null, NOW));
			const down = await failure(c.requestCode(deps, ADDRESS));
			return [[spent.status, spent.code], [down.status, down.code]];
		};
		assert.deepEqual(await outcomes(client), [[502, 'sudo_proof_invalid'], [503, 'sudo_unavailable']]);
		assert.deepEqual(await outcomes(mail), [[502, 'email_proof_invalid'], [503, 'email_unavailable']]);
	});
});
