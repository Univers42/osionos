/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   avatar-storage.mjs                                 :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The avatar plane in memory: a storage router over a real socket and a bridge
// whose BaaS is the PostgREST mock. Shared by the avatar and banner bridge tests.

import { createServer } from 'node:http';

import { IDS, createPostgrestMock, harnessConfig, withBridge } from './bridge-harness.mjs';

const config = harnessConfig();

/** The storage router in memory, over a real socket: the bridge reaches it with the global fetch. */
export async function storageRouter() {
	const objects = new Map();
	let puts = 0;
	let gets = 0;
	const server = createServer((request, response) => {
		const url = new URL(request.url, 'http://storage.test');
		if (url.pathname.includes('/bucket/')) {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end('{"created":false}');
			return;
		}
		const key = `${request.headers['x-user-id']}/${decodeURIComponent(/\/object\/[^/]+\/(.+)$/.exec(url.pathname)[1])}`;
		if (request.method === 'PUT') {
			puts += 1;
			const chunks = [];
			request.on('data', (chunk) => chunks.push(chunk));
			request.on('end', () => {
				objects.set(key, { body: Buffer.concat(chunks), contentType: request.headers['content-type'] });
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end('{"ok":true}');
			});
			return;
		}
		gets += 1;
		const stored = objects.get(key);
		if (!stored) {
			response.writeHead(404);
			response.end('missing');
			return;
		}
		if (request.method === 'DELETE') {
			objects.delete(key);
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end('{"ok":true}');
			return;
		}
		response.writeHead(200, { 'content-type': stored.contentType });
		response.end(stored.body);
	});
	await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
	const previous = process.env.STORAGE_ROUTER_URL;
	process.env.STORAGE_ROUTER_URL = `http://127.0.0.1:${server.address().port}/storage/v1`;
	return {
		objects,
		stats: () => ({ puts, gets }),
		restore: () => { process.env.STORAGE_ROUTER_URL = previous; },
		close: () => new Promise((done) => server.close(done)),
	};
}

/** A bridge whose BaaS is the PostgREST mock and whose storage is the router above. */
export async function avatarBridge(run, { identities = [], profiles = [{ user_id: IDS.userA, display_name: 'Alice', avatar_url: null }] } = {}) {
	const storage = await storageRouter();
	const mock = createPostgrestMock({
		osionos_bridge_identities: identities,
		osionos_profiles: profiles,
	});
	try {
		return await withBridge(config, mock.fetchImpl, (base) => run({ base, storage, mock }));
	} finally {
		storage.restore();
		await storage.close();
	}
}
