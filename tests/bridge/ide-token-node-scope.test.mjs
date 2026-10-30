/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-token-node-scope.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An IDE token that may open a connected machine carries scope "node", and the bridge mints one
// only for a session holding a fresh step-up (devil verdict 2026-10-30, C10): a stolen app token
// alone never reaches a machine's shell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { configFromEnv, signAppSessionToken, verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createIdeTokenHandler } from '../../scripts/bridge-ide-token.mjs';
import { grantSudo } from '../../scripts/bridge-guard.mjs';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { signIdeToken, verifyIdeToken } from '../../scripts/ide-token.mjs';

const APP_SECRET = 'a'.repeat(40);
const IDE_SECRET = 'k'.repeat(32);
const WS = 'cccccccc-3333-4333-8333-cccccccccccc';
const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const config = configFromEnv({ OSIONOS_APP_URL: 'http://localhost:3001', OSIONOS_APP_SESSION_SECRET: APP_SECRET });
const env = { OSIONOS_IDE_TOKEN_SECRET: IDE_SECRET, OSIONOS_APP_SESSION_SECRET: APP_SECRET, OSIONOS_IDE_ALLOWED_SUBJECTS: USER };

test('the node scope round-trips; a plain token has none', () => {
	const node = signIdeToken({ userId: USER, workspaceId: WS, secret: IDE_SECRET, scope: 'node' }).token;
	assert.equal(verifyIdeToken(node, { secret: IDE_SECRET }).scope, 'node');
	const plain = signIdeToken({ userId: USER, workspaceId: WS, secret: IDE_SECRET }).token;
	assert.equal(verifyIdeToken(plain, { secret: IDE_SECRET }).scope, null);
	assert.throws(() => signIdeToken({ userId: USER, workspaceId: WS, secret: IDE_SECRET, scope: 'root' }), { status: 400 });
});

function request(body, token) {
	const req = Readable.from([JSON.stringify(body)]);
	req.method = 'POST';
	req.headers = { authorization: `Bearer ${token}` };
	return req;
}

async function mint(kv, body, token) {
	const handler = createIdeTokenHandler({ config, verifySession: verifyAppSessionToken, env, kv, requireWorkspaceAccess: async () => ({ role: 'owner' }) });
	const res = { statusCode: 0, body: '', writeHead(status) { this.statusCode = status; }, end(text) { this.body = String(text ?? ''); } };
	await handler(new URL('http://x/api/ide/token'), request(body, token), res);
	return { status: res.statusCode, json: JSON.parse(res.body) };
}

test('a node-scoped mint is refused without a step-up, and granted with one', async () => {
	const kv = createKv({ logger: { warn() {} } });
	const appToken = signAppSessionToken({ payload: { subject: USER, provider: 'test' }, workspace: { _id: WS }, config }).token;
	const refused = await mint(kv, { workspaceId: WS, scope: 'node' }, appToken);
	assert.equal(refused.status, 403);
	assert.equal(refused.json.code ?? refused.json.reason ?? 'sudo_required', 'sudo_required');

	await grantSudo(kv, verifyAppSessionToken(appToken, config));
	const granted = await mint(kv, { workspaceId: WS, scope: 'node' }, appToken);
	assert.equal(granted.status, 200);
	assert.equal(verifyIdeToken(granted.json.token, { secret: IDE_SECRET }).scope, 'node');

	const plain = await mint(kv, { workspaceId: WS }, appToken);
	assert.equal(verifyIdeToken(plain.json.token, { secret: IDE_SECRET }).scope, null, 'no scope asked, none given');
	const odd = await mint(kv, { workspaceId: WS, scope: 'admin' }, appToken);
	assert.equal(odd.status, 400);
});
