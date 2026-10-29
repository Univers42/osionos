/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-auth-turnstile.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The app sign-in proxy and Turnstile: the browser's token is the one that is verified and
 * forwarded, the bridge verifies it itself through siteverify, and the bypass is explicit and
 * refuses to boot on a public deployment.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv } from '../../scripts/bridge-api.mjs';
import { LOCAL_BYPASS_TOKEN, turnstileBootLine } from '../../scripts/bridge-turnstile.mjs';
import { authEnv, SECRET, startAuthWorld } from './support/auth-world.mjs';

const CREDENTIALS = { email: 'ada@example.com', password: 'correct horse battery' };
const secured = { OSIONOS_BRIDGE_TURNSTILE: 'enforce', TURNSTILE_SECRET_KEY: SECRET };
const bypassed = { ...secured, TURNSTILE_BYPASS_LOCAL: 'true' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

describe('turnstile on /api/auth/login and /api/auth/register', () => {
	it('refuses a request with no token when the bypass is off, and never calls the gateway', async (t) => {
		const world = await startAuthWorld(t, { env: secured });
		for (const path of ['/api/auth/login', '/api/auth/register']) {
			const response = await world.post(path, CREDENTIALS);
			assert.equal(response.status, 422);
			assert.equal(response.body.code, 'turnstile_required');
		}
		assert.deepEqual(world.calls.gateway, []);
		assert.deepEqual(world.calls.siteverify, []);
	});

	it('verifies the browser token with siteverify and forwards that exact token to the gateway', async (t) => {
		const world = await startAuthWorld(t, { env: secured });
		const response = await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'real-token' });
		assert.equal(response.status, 200);
		assert.equal(world.calls.siteverify.length, 1);
		assert.equal(world.calls.siteverify[0].secret, SECRET);
		assert.equal(world.calls.siteverify[0].response, 'real-token');
		const login = world.calls.gateway.find((call) => call.route === '/api/auth/login');
		assert.equal(login.body.turnstileToken, 'real-token');
	});

	it('forwards the token on register too', async (t) => {
		const world = await startAuthWorld(t, { env: secured });
		const response = await world.post('/api/auth/register', { ...CREDENTIALS, turnstileToken: 'real-token' });
		assert.equal(response.status, 200);
		const register = world.calls.gateway.find((call) => call.route === '/api/auth/register');
		assert.equal(register.body.turnstileToken, 'real-token');
		assert.equal(world.calls.siteverify.length, 1);
	});

	it('accepts cf-turnstile-response, trims it, and lets the first non-empty field win', async (t) => {
		const world = await startAuthWorld(t, { env: secured });
		await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: '   ', 'cf-turnstile-response': '  cf-token  ' });
		assert.equal(world.calls.siteverify[0].response, 'cf-token');
		await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'first', 'cf-turnstile-response': 'second' });
		assert.equal(world.calls.siteverify[1].response, 'first');
	});

	it('refuses a token over 2048 characters or a non-string token without calling Cloudflare', async (t) => {
		const world = await startAuthWorld(t, { env: secured });
		const long = await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'x'.repeat(2049) });
		assert.equal(long.status, 422);
		assert.equal(long.body.code, 'turnstile_failed');
		const object = await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: { a: 1 } });
		assert.equal(object.body.code, 'turnstile_required');
		assert.deepEqual(world.calls.siteverify, []);
		assert.deepEqual(world.calls.gateway, []);
	});

	it('answers 422 turnstile_failed when Cloudflare says no, and 503 when Cloudflare cannot be reached', async (t) => {
		let mode = 'refuse';
		const world = await startAuthWorld(t, {
			env: secured,
			siteverify: () => {
				if (mode === 'down') throw new Error('network down');
				if (mode === 'bad') return reply({}, 500);
				return reply({ success: false, 'error-codes': ['invalid-input-response'] });
			},
		});
		const send = () => world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'real-token' });
		const refused = await send();
		assert.equal(refused.status, 422);
		assert.equal(refused.body.code, 'turnstile_failed');
		mode = 'down';
		assert.equal((await send()).status, 503);
		mode = 'bad';
		assert.equal((await send()).status, 503);
		assert.deepEqual(world.calls.gateway, []);
	});

	it('with the bypass on and no token, forwards the localhost token and never calls Cloudflare', async (t) => {
		const world = await startAuthWorld(t, { env: bypassed });
		const response = await world.post('/api/auth/login', CREDENTIALS);
		assert.equal(response.status, 200);
		assert.equal(world.calls.gateway.find((call) => call.route === '/api/auth/login').body.turnstileToken, 'localhost-turnstile-token');
		assert.deepEqual(world.calls.siteverify, []);
	});

	it('with the bypass on and a token, still forwards the real token', async (t) => {
		const world = await startAuthWorld(t, { env: bypassed });
		await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'real-token' });
		assert.equal(world.calls.gateway.find((call) => call.route === '/api/auth/login').body.turnstileToken, 'real-token');
	});

	it('never writes the secret to a response or to the console', async (t) => {
		const written = [];
		for (const level of ['log', 'info', 'warn', 'error']) t.mock.method(console, level, (...args) => written.push(args.join(' ')));
		const world = await startAuthWorld(t, { env: secured, siteverify: () => { throw new Error(`down ${SECRET}`); } });
		const response = await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'real-token' });
		assert.ok(!response.text.includes(SECRET));
		assert.ok(!written.join('\n').includes(SECRET));
	});
});

describe('OSIONOS_BRIDGE_TURNSTILE=off, the default', () => {
	const loginBody = (world, extra = {}) => world.post('/api/auth/login', { ...CREDENTIALS, ...extra });
	const forwarded = (world) => world.calls.gateway.find((call) => call.route === '/api/auth/login').body.turnstileToken;

	it('with no token, no secret and no bypass answers exactly as before: the constant token goes to the gateway', async (t) => {
		const world = await startAuthWorld(t);
		const response = await loginBody(world);
		assert.equal(response.status, 200);
		assert.equal(forwarded(world), LOCAL_BYPASS_TOKEN);
		assert.deepEqual(world.calls.siteverify, []);
	});

	it('forwards the constant whatever the browser sent, and never calls Cloudflare, even with a secret', async (t) => {
		const world = await startAuthWorld(t, { env: { TURNSTILE_SECRET_KEY: SECRET } });
		await loginBody(world, { turnstileToken: 'real-token' });
		assert.equal(forwarded(world), LOCAL_BYPASS_TOKEN);
		assert.deepEqual(world.calls.siteverify, []);
	});

	it('ignores the bypass switch: it only has a meaning under enforce', async (t) => {
		assert.equal(configFromEnv(authEnv({ TURNSTILE_BYPASS_LOCAL: 'true', NODE_ENV: 'production' })).turnstileBypassLocal, false);
		assert.match(turnstileBootLine(configFromEnv(authEnv())), /off/);
	});
});

describe('which token reaches the gateway in each mode', () => {
	const cases = [
		['off, token sent', {}, 'real-token', LOCAL_BYPASS_TOKEN],
		['off, no token', {}, undefined, LOCAL_BYPASS_TOKEN],
		['enforce, token sent', secured, 'real-token', 'real-token'],
		['enforce + bypass, token sent', bypassed, 'real-token', 'real-token'],
		['enforce + bypass, no token', bypassed, undefined, LOCAL_BYPASS_TOKEN],
	];
	for (const [label, env, sent, expected] of cases) {
		it(label, async (t) => {
			const world = await startAuthWorld(t, { env });
			await world.post('/api/auth/login', { ...CREDENTIALS, ...(sent ? { turnstileToken: sent } : {}) });
			assert.equal(world.calls.gateway.find((call) => call.route === '/api/auth/login').body.turnstileToken, expected);
		});
	}
});

describe('siteverify answers', () => {
	for (const [label, answer] of [['no success field', {}], ['success as the string "true"', { success: 'true' }], ['success 1', { success: 1 }]]) {
		it(`refuses ${label}`, async (t) => {
			const world = await startAuthWorld(t, { env: secured, siteverify: () => reply(answer) });
			const response = await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'real-token' });
			assert.equal(response.status, 422);
			assert.equal(response.body.code, 'turnstile_failed');
			assert.deepEqual(world.calls.gateway, []);
		});
	}

	it('sends the header-derived address as remoteip when the header is configured', async (t) => {
		const world = await startAuthWorld(t, { env: { ...secured, OSIONOS_BRIDGE_CLIENT_IP_HEADER: 'x-real-ip' } });
		await world.post('/api/auth/login', { ...CREDENTIALS, turnstileToken: 'real-token' }, { 'x-real-ip': '203.0.113.9' });
		assert.equal(world.calls.siteverify[0].remoteip, '203.0.113.9');
	});
});

describe('the Turnstile settings at boot', () => {
	it('refuses an unknown mode, and enforce without a secret', () => {
		assert.throws(() => configFromEnv(authEnv({ OSIONOS_BRIDGE_TURNSTILE: 'on' })), /OSIONOS_BRIDGE_TURNSTILE/);
		assert.throws(() => configFromEnv(authEnv({ OSIONOS_BRIDGE_TURNSTILE: 'enforce' })), /TURNSTILE_SECRET_KEY/);
	});

	it('turns the bypass on only for the exact string "true"', () => {
		for (const value of [undefined, '', 'TRUE', '1', 'yes', ' true']) {
			assert.equal(configFromEnv(authEnv({ ...secured, TURNSTILE_BYPASS_LOCAL: value })).turnstileBypassLocal, false, String(value));
		}
		assert.equal(configFromEnv(authEnv(bypassed)).turnstileBypassLocal, true);
	});

	it('refuses the bypass under NODE_ENV=production, GROBASE_PUBLIC_ADDRESSES or a public https origin', () => {
		assert.throws(() => configFromEnv(authEnv({ ...bypassed, NODE_ENV: 'production' })), /TURNSTILE_BYPASS_LOCAL/);
		assert.throws(() => configFromEnv(authEnv({ ...bypassed, GROBASE_PUBLIC_ADDRESSES: 'a.example.com' })), /TURNSTILE_BYPASS_LOCAL/);
		assert.throws(() => configFromEnv(authEnv({ ...bypassed, OSIONOS_APP_URL: 'https://app.example.com' })), /TURNSTILE_BYPASS_LOCAL/);
		assert.throws(() => configFromEnv(authEnv({ ...bypassed, OSIONOS_ALLOWED_ORIGIN: 'https://app.example.com' })), /TURNSTILE_BYPASS_LOCAL/);
		assert.doesNotThrow(() => configFromEnv(authEnv({ ...bypassed, OSIONOS_APP_URL: 'https://localhost:3001' })));
		assert.doesNotThrow(() => configFromEnv(authEnv({ ...secured, NODE_ENV: 'production' })));
	});

	it('says in the boot line which mode runs, and never prints the secret', () => {
		const verified = turnstileBootLine(configFromEnv(authEnv(secured)));
		assert.match(verified, /enforce.*siteverify/);
		assert.match(turnstileBootLine(configFromEnv(authEnv(bypassed))), /BYPASS/);
		assert.ok(!verified.includes(SECRET));
	});
});
