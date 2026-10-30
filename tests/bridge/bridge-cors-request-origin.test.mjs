// An admitted origin (requestOriginConfig: localhost, tauri, app://osionos) is echoed on every
// route family, including the account plane and perms, which are built once at boot; a foreign
// origin never is. The boot origin is set apart from every admitted one so a leak is visible.
// Caveat: one GET per module, unauthenticated and authenticated; a verb a module serves only on
// POST/PATCH/DELETE is covered only through the shared head rewrite, not by its own row here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const WEB = 'https://web.example';
process.env.OSIONOS_ALLOWED_ORIGIN = WEB; // perms reads its origin from the environment, not the config
const WS = IDS.homeA;
const PATHS = [
	'/api/account/profile', '/api/preferences', '/api/account/notification-settings', '/api/account/2fa/status',
	'/api/account/identities', '/api/account/emails', '/api/account/settings', '/api/account/sessions',
	`/api/workspaces/${WS}/settings`, `/api/workspaces/${WS}/teams`, `/api/workspaces/${WS}/library-views`,
	`/api/perms/roles?workspaceId=${WS}`, `/api/perms/people?workspaceId=${WS}`, `/api/perms/rules?workspaceId=${WS}`,
	'/api/chat/channels', '/api/workspaces',
];
const config = harnessConfig({ env: { OSIONOS_ALLOWED_ORIGIN: WEB } });
const auth = sessionHeaders(config, IDS.userA, WS);

async function allowOrigins(origin) {
	const mock = createPostgrestMock({ osionos_workspace_members: [{ workspace_id: WS, user_id: IDS.userA, role: 'owner' }] });
	return withBridge(config, mock.fetchImpl, async (base) => {
		const seen = {};
		for (const path of PATHS) {
			for (const headers of [{ origin }, { ...auth, origin }]) {
				const answer = await fetch(`${base}${path}`, { headers });
				await answer.arrayBuffer();
				seen[`${headers.authorization ? 'auth' : 'anon'} ${path}`] = answer.headers.get('access-control-allow-origin');
			}
		}
		return seen;
	});
}

const every = (seen, value) => Object.fromEntries(Object.keys(seen).map((key) => [key, value]));

describe('the per-request CORS origin', () => {
	for (const origin of ['app://osionos', 'tauri://localhost', 'http://localhost:5173']) {
		it(`echoes ${origin} on every route family`, async () => {
			const seen = await allowOrigins(origin);
			assert.deepEqual(seen, every(seen, origin));
		});
	}

	it('keeps the boot origin for the web origin and for a foreign one', async () => {
		for (const origin of [WEB, 'https://evil.example', 'app://osionos.evil.example']) {
			const seen = await allowOrigins(origin);
			assert.deepEqual(seen, every(seen, WEB));
		}
	});
});
