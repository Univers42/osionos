/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-media.test.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+       +#+       */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Page-media uploads: session-authed POST stores bytes owner-scoped in the
// storage router; the returned capability URL streams them back with NO
// session (a plain <img src> must work), 304 on a matching ETag.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
	configFromEnv,
	createBridgeServer,
	createUserSession,
	validateBridgePayload,
} from '../../scripts/bridge-api.mjs';

const subject = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const payload = {
	provider: 'prismatica',
	subject,
	email: 'Owner@example.com',
	name: 'Owner',
	jti: '1c76c7f0-f07e-442d-96fd-77d601764c3b',
};

function testConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
	});
}

function appSessionToken(config) {
	return createUserSession(validateBridgePayload(payload), config, {
		workspaceId: '1cc0693b-59dd-4d51-86d9-de86d088f9df',
		workspaceName: "Owner's osionos",
		workspaceSlug: 'owner-osionos-3f6d2a70',
	}, Date.now()).session.accessToken;
}

/** In-memory stand-in for the storage router (bucket ensure / PUT / GET). */
function fakeStorageFetch(objects) {
	return async (input, init = {}) => {
		const url = String(input);
		const method = (init.method || 'GET').toUpperCase();
		if (url.includes('/bucket/') && method === 'POST') {
			return new Response(JSON.stringify({ created: false }), { status: 200 });
		}
		const object = /\/object\/[^/]+\/(.+)$/.exec(new URL(url).pathname);
		if (object && method === 'PUT') {
			const owner = init.headers?.['x-user-id'];
			objects.set(`${owner}/${decodeURIComponent(object[1])}`, {
				body: Buffer.from(init.body),
				contentType: init.headers?.['content-type'],
			});
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}
		if (object && method === 'GET') {
			const owner = init.headers?.['x-user-id'];
			const stored = objects.get(`${owner}/${decodeURIComponent(object[1])}`);
			if (!stored) return new Response('missing', { status: 404 });
			return new Response(stored.body, {
				status: 200,
				headers: { 'content-type': stored.contentType },
			});
		}
		return new Response('unexpected', { status: 500 });
	};
}

async function listen(server) {
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	return `http://127.0.0.1:${server.address().port}`;
}

describe('bridge media uploads', () => {
	const objects = new Map();
	const config = testConfig();
	const server = createBridgeServer({ config, fetchImpl: fakeStorageFetch(objects) });
	let base;

	after(() => server.close());

	it('rejects an upload without a session', async () => {
		base ??= await listen(server);
		const res = await fetch(`${base}/api/media/uploads`, {
			method: 'POST',
			headers: { 'content-type': 'image/png' },
			body: Buffer.from('png-bytes'),
		});
		assert.equal(res.status, 401);
	});

	it('stores bytes owner-scoped and serves them back via the capability URL', async () => {
		base ??= await listen(server);
		const token = appSessionToken(config);
		const bytes = Buffer.from('fake-image-bytes');

		const upload = await fetch(`${base}/api/media/uploads?name=photo.png`, {
			method: 'POST',
			headers: { 'content-type': 'image/png', authorization: `Bearer ${token}` },
			body: bytes,
		});
		assert.equal(upload.status, 201);
		const body = await upload.json();
		assert.equal(body.ok, true);
		assert.match(body.media.url, new RegExp(`^/api/media/uploads/${subject}/[0-9a-f]{64}\\.png$`));
		assert.equal(body.media.size, bytes.length);

		// Capability URL: NO Authorization header — a plain <img src> fetch.
		const serve = await fetch(`${base}${body.media.url}`);
		assert.equal(serve.status, 200);
		assert.equal(serve.headers.get('content-type'), 'image/png');
		assert.deepEqual(Buffer.from(await serve.arrayBuffer()), bytes);

		const etag = serve.headers.get('etag');
		assert.ok(etag, 'serves an etag');
		const revalidate = await fetch(`${base}${body.media.url}`, {
			headers: { 'if-none-match': etag },
		});
		assert.equal(revalidate.status, 304);
	});

	it('404s an unknown media key', async () => {
		base ??= await listen(server);
		const missing = `${base}/api/media/uploads/${subject}/${'0'.repeat(64)}.png`;
		const res = await fetch(missing);
		assert.equal(res.status, 404);
	});
});
