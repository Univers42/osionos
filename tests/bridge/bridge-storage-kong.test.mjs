/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-storage-kong.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Live, the bridge reaches grobase only through Kong: the storage router's own
// name never resolves here, and Kong clears a client's `x-user-id`. Every media
// read and write returned 502 until the bridge proved the user to Kong with a
// short-lived token Kong verifies and turns into the router's `x-user-id`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { storageBase, storageDelete, storageGet, storagePut } from '../../scripts/bridge-storage-core.mjs';
import { pngFixture } from './support/image-fixtures.mjs';

const OWNER = 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1';
const SECRET = 'test-jwt-secret-of-the-gateway-0123456789';
const KONG_ENV = { OSIONOS_BAAS_URL: 'http://kong.test:8000/', JWT_SECRET: SECRET, KONG_PUBLIC_API_KEY: 'anon-key' };

function recorder(status = 200, body = '{"ok":true}') {
	const calls = [];
	const fake = async (input, init = {}) => {
		calls.push({ url: String(input), headers: init.headers ?? {} });
		return new Response(body, { status });
	};
	return { fake, calls };
}

function verifiedClaims(authorization) {
	const [, token] = /^Bearer (.+)$/.exec(authorization ?? '') ?? [];
	assert.ok(token, 'a bearer token is sent');
	const [head, body, sig] = token.split('.');
	assert.equal(createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url'), sig, 'signed with JWT_SECRET');
	return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

describe('bridge-storage-kong', () => {
	it('defaults to the Kong storage route when no router URL is configured', () => {
		assert.equal(storageBase(KONG_ENV), 'http://kong.test:8000/storage/v1');
		assert.equal(storageBase({ ...KONG_ENV, STORAGE_ROUTER_URL: 'http://router:3040/storage/v1/' }), 'http://router:3040/storage/v1');
	});

	it('proves the owner to Kong on every call: api key plus a one-minute token for that user', async () => {
		const { fake, calls } = recorder();
		await storagePut(OWNER, 'k.png', 'image/png', pngFixture(), fake, KONG_ENV);
		await storageGet(OWNER, 'k.png', fake, KONG_ENV);
		await storageDelete(OWNER, 'k.png', fake, KONG_ENV);
		assert.equal(calls.length, 3);
		for (const { url, headers } of calls) {
			assert.match(url, /^http:\/\/kong\.test:8000\/storage\/v1\/object\/chat\/k\.png$/);
			assert.equal(headers.apikey, 'anon-key');
			assert.equal(headers['x-user-id'], OWNER, 'a router reached directly still reads the owner');
			const claims = verifiedClaims(headers.authorization);
			assert.equal(claims.sub, OWNER);
			assert.equal(claims.role, 'authenticated');
			assert.equal(claims.iss, 'supabase');
			assert.equal(claims.exp - claims.iat, 60);
		}
	});

	it('without the gateway secret it sends no token rather than a forged one', async () => {
		const { fake, calls } = recorder();
		await storageGet(OWNER, 'k.png', fake, { STORAGE_ROUTER_URL: 'http://router:3040/storage/v1' });
		assert.equal(calls[0].headers.authorization, undefined);
		assert.equal(calls[0].headers['x-user-id'], OWNER);
	});
});
