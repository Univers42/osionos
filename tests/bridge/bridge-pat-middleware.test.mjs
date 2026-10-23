/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pat-middleware.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Bearer middleware of the personal access tokens: a PAT is looked up, refused with one
 * answer for every bad token, and exchanged for a 120-second internal session before any route
 * runs. The mask is applied once, by the gate, to the response and to the write; the PAT
 * itself reaches no route, no downstream call and no audit row.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionHeaders, send } from './support/bridge-harness.mjs';
import { mintPatSecret } from '../../scripts/bridge-pat-store.mjs';
import { memberWorkspaceEntries } from '../../scripts/bridge-api.mjs';
import { installResponseMask, patWritePayload, PAT_ROUTES } from '../../scripts/bridge-pat-middleware.mjs';
import { PAT_TABLE } from './support/pat-postgrest.mjs';
import { auditRows, bearer, everythingSent, fakeRequest, fakeResponse, fineGrained, HOME, OWNER, PAGE, patRow, startPatWorld } from './support/pat-world.mjs';

const PAGE_PATH = `/api/pages/${PAGE}`;
const claimsOf = (header) => JSON.parse(Buffer.from(header.split('.')[1], 'base64url').toString('utf8'));
const lastUse = (world) => auditRows(world).filter((row) => row.event_type === 'pat_use');

async function viaPat(t, spec, tokenOptions = {}, worldOptions = {}) {
	const { secret, row } = patRow({ ...spec, ...tokenOptions });
	const world = await startPatWorld(t, { tokens: [row], ...worldOptions });
	return { world, secret, row };
}

describe('a valid PAT reads a page through the mask', () => {
	it('answers a fine-grained token with the keys it asked for and nothing else', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title', 'icon']));
		const answer = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { _id: PAGE, title: 'Plan', icon: 'P' });
	});

	it('answers an attribute list of one with exactly _id and that key', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title']));
		const answer = await send(world.base, PAGE_PATH, bearer(secret));
		assert.deepEqual(Object.keys(answer.body).sort(), ['_id', 'title']);
	});

	it('answers a classic token with the page entry an app session reads', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const viaSession = await send(world.base, PAGE_PATH, sessionHeaders(world.config, OWNER, HOME));
		const answer = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, viaSession.body);
		assert.ok(answer.body.content);
	});
});

describe('every bad token gets the same answer', () => {
	const unknown = patRow().secret;
	const wrongSecret = (secret) => `${secret.slice(0, -1)}${secret.endsWith('A') ? 'B' : 'A'}`;
	const cases = [
		['malformed: too short', () => 'osio_pat_short', {}],
		['malformed: bad characters', () => `osio_pat_${'!'.repeat(43)}`, {}],
		['unknown secret', () => unknown, {}],
		['wrong secret', wrongSecret, {}],
		['expired', (secret) => secret, { expiresAt: '2026-01-01T00:00:00.000Z' }],
		['revoked', (secret) => secret, { revokedAt: '2026-10-02T00:00:00.000Z' }],
	];

	it('answers the six byte for byte with 401 pat_invalid', async (t) => {
		const texts = new Set();
		for (const [name, present, overrides] of cases) {
			const { world, secret } = await viaPat(t, {}, overrides);
			const answer = await send(world.base, PAGE_PATH, bearer(present(secret)));
			assert.equal(answer.status, 401, name);
			texts.add(answer.text);
		}
		assert.deepEqual([...texts], ['{"error":"pat_invalid"}']);
	});

	it('writes the reason to the audit row of a token that resolved, and only there', async (t) => {
		const expired = await viaPat(t, {}, { expiresAt: '2026-01-01T00:00:00.000Z' });
		await send(expired.world.base, PAGE_PATH, bearer(expired.secret));
		const revoked = await viaPat(t, {}, { revokedAt: '2026-10-02T00:00:00.000Z' });
		await send(revoked.world.base, PAGE_PATH, bearer(revoked.secret));
		const unresolved = await startPatWorld(t);
		await send(unresolved.base, PAGE_PATH, bearer(patRow().secret));
		assert.equal(lastUse(expired.world)[0].details.outcome, 'expired');
		assert.equal(lastUse(revoked.world)[0].details.outcome, 'revoked');
		assert.equal(auditRows(unresolved).length, 0);
	});

	it('answers 503, never 401, when the token store fails', async (t) => {
		const { world, secret } = await viaPat(t, {}, {}, { fail: (call) => (call.table === PAT_TABLE ? { status: 500 } : null) });
		const answer = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(answer.status, 503);
		assert.notEqual(answer.body.error, 'pat_invalid');
	});

	it('refuses a PAT of an owner who has no workspace with 403 pat_no_workspace', async (t) => {
		const { world, secret } = await viaPat(t, {}, {}, { hasIdentity: false });
		const answer = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(answer.status, 403);
		assert.equal(answer.body.error, 'pat_no_workspace');
	});
});

describe('the route allowlist is the whole surface', () => {
	const refused = [
		['GET', '/api/account/tokens'],
		['GET', '/api/pages'],
		['GET', `${PAGE_PATH}/config`],
		['POST', PAGE_PATH],
		['DELETE', PAGE_PATH],
	];

	it('refuses every other path and method with 403 pat_route_not_allowed', async (t) => {
		const { world, secret } = await viaPat(t, {}, { scopes: ['pages:read', 'pages:write'] });
		for (const [method, path] of refused) {
			const answer = await send(world.base, path, bearer(secret), { method, body: method === 'POST' ? '{}' : undefined });
			assert.equal(answer.status, 403, `${method} ${path}`);
			assert.equal(answer.body.error, 'pat_route_not_allowed', `${method} ${path}`);
		}
	});

	it('never lets a PAT reach the token routes: the table sees only the service-role lookup', async (t) => {
		const { world, secret } = await viaPat(t, {});
		await send(world.base, '/api/account/tokens', bearer(secret));
		const reads = world.patStore.callsTo(PAT_TABLE);
		assert.ok(reads.length > 0);
		assert.ok(reads.every((call) => call.claims === null && call.params.has('token_hash')));
	});

	it('lists exactly the six routes', () => {
		assert.deepEqual(PAT_ROUTES.map((route) => `${route.method} ${route.permission}`).sort(), ['GET read', 'GET read', 'GET read', 'PATCH write', 'POST write', 'POST write']);
	});
});

describe('the scope has to cover the route', () => {
	it('refuses a read-only token on PATCH with 403 pat_scope_denied and leaves the page alone', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const answer = await send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: JSON.stringify({ title: 'Hijacked' }) });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.error, 'pat_scope_denied');
		assert.equal(world.pages.page(PAGE).title, 'Plan');
	});

	it('refuses a fine-grained grant that names read only', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title'], ['read']));
		const answer = await send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: JSON.stringify({ title: 'Hijacked' }) });
		assert.equal(answer.body.error, 'pat_scope_denied');
	});
});

describe('a write is held to the token write set', () => {
	const write = (attributes) => fineGrained(attributes, ['read', 'write']);
	const patch = (world, secret, body) => send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: JSON.stringify(body) });

	it('lands the attribute the token may change', async (t) => {
		const { world, secret } = await viaPat(t, write(['title']));
		const answer = await patch(world, secret, { title: 'Renamed' });
		assert.equal(answer.status, 200);
		assert.equal(world.pages.page(PAGE).title, 'Renamed');
	});

	it('refuses a payload that names another attribute, and writes none of it', async (t) => {
		const { world, secret } = await viaPat(t, write(['title']));
		const answer = await patch(world, secret, { title: 'Renamed', visibility: 'shared' });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'pat_forbidden_attribute');
		assert.equal(world.pages.page(PAGE).visibility, 'private');
		assert.equal(world.pages.page(PAGE).title, 'Plan');
	});

	it('lets the version control field through, because it is not a page attribute', () => {
		assert.deepEqual(patWritePayload({ title: 'T', baseVersion: 3 }, ['title']), { title: 'T', baseVersion: 3 });
	});

	it('names the forbidden attributes in the error', () => {
		assert.throws(() => patWritePayload({ title: 'T', visibility: 'x', ownerId: 'y' }, ['title']), (error) => error.status === 403 && error.code === 'pat_forbidden_attribute' && error.message.includes('ownerId, visibility'));
	});
});

describe('a refused write does not carry what the mask denies', () => {
	const stale = (world, secret) => send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: JSON.stringify({ baseVersion: 999999 }) });

	it('answers a stale baseVersion with 409 and no page content for a token that cannot read it', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title'], ['read', 'write']));
		const answer = await stale(world, secret);
		assert.equal(answer.status, 409);
		assert.ok(!answer.text.includes('the body'));
		assert.equal(answer.body.details?.content, undefined);
		assert.equal(answer.body.code, 'version_conflict');
	});

	it('keeps the content in the 409 for a token whose grant covers it', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title', 'content'], ['read', 'write']));
		const answer = await stale(world, secret);
		assert.equal(answer.status, 409);
		assert.deepEqual(answer.body.details.content, [{ id: 'b1', type: 'paragraph', content: 'the body' }]);
	});

	it('strips the content for a token that may write it but not read it', async (t) => {
		const { world, secret } = await viaPat(t, { kind: 'fine_grained', scopes: [], grants: [{ resource: 'pages', attributes: ['title'], permissions: ['read'] }, { resource: 'pages', attributes: ['content'], permissions: ['write'] }] });
		const answer = await stale(world, secret);
		assert.equal(answer.status, 409);
		assert.ok(!answer.text.includes('the body'));
	});
});

describe('every PAT request is audited, before the route runs', () => {
	it('writes one pat_use row with the token, method, path and outcome', async (t) => {
		const { world, secret, row } = await viaPat(t, {});
		await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(lastUse(world).length, 1);
		assert.deepEqual(lastUse(world)[0].details, { tokenId: row.id, method: 'GET', path: PAGE_PATH, outcome: 'allowed' });
		assert.equal(lastUse(world)[0].actor_id, OWNER);
		assert.match(lastUse(world)[0].session_id, /^[0-9a-f-]{36}$/);
	});

	it('writes the row before the first page read', async (t) => {
		const { world, secret } = await viaPat(t, {});
		await send(world.base, PAGE_PATH, bearer(secret));
		const order = world.seen.map((call) => call.table);
		assert.ok(order.indexOf('osionos_bridge_audit_events') < order.indexOf('osionos_pages'));
	});

	it('audits an allowed use once an hour per token and stamps last_used_at with it', async (t) => {
		const { world, secret, row } = await viaPat(t, {});
		await send(world.base, PAGE_PATH, bearer(secret));
		await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(lastUse(world).length, 1);
		assert.ok(world.patStore.rows(PAT_TABLE)[0].last_used_at);
		assert.equal(world.patStore.rows(PAT_TABLE)[0].id, row.id);
	});

	it('audits again when the last use is older than an hour', async (t) => {
		const { world, secret } = await viaPat(t, {}, { lastUsedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() });
		await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(lastUse(world).length, 1);
	});

	it('audits a denial once per token and outcome per hour, however often it repeats', async (t) => {
		const { world, secret } = await viaPat(t, {});
		for (let index = 0; index < 20; index += 1) await send(world.base, '/api/pages', bearer(secret));
		await send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: '{}' });
		await send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: '{}' });
		assert.deepEqual(lastUse(world).map((row) => row.details.outcome), ['route_not_allowed', 'scope_denied']);
	});

});

describe('the PAT never travels past the gate', () => {
	it('appears in no downstream call, no audit row, no response and no log line', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const lines = [];
		const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
		for (const name of Object.keys(original)) console[name] = (...args) => lines.push(args.join(' '));
		let answers;
		try {
			answers = [
				await send(world.base, PAGE_PATH, bearer(secret)),
				await send(world.base, '/api/workspaces', bearer(secret)),
				await send(world.base, PAGE_PATH, bearer(`${secret.slice(0, -1)}${secret.endsWith('A') ? 'B' : 'A'}`)),
			];
		} finally {
			Object.assign(console, original);
		}
		assert.ok(!everythingSent(world).includes(secret));
		assert.ok(!answers.some((answer) => answer.text.includes(secret)));
		assert.ok(!lines.some((line) => line.includes(secret) || line.includes(secret.slice(9))));
	});

	it('replaces the header with an osionos_v1 session before any route reads it', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const request = fakeRequest(secret);
		const handled = await world.gate(request, fakeResponse(), new URL(`http://bridge.test${PAGE_PATH}`), world.config);
		assert.equal(handled, false);
		assert.match(request.headers.authorization, /^Bearer osionos_v1\./);
		assert.ok(!JSON.stringify([request.headers, request.rawHeaders]).includes(secret));
	});

	it('mints a 120 second session that is never admin, even for an administrator', async (t) => {
		const { world, secret } = await viaPat(t, {}, {}, { ownerIsAdmin: true });
		const request = fakeRequest(secret);
		await world.gate(request, fakeResponse(), new URL(`http://bridge.test${PAGE_PATH}`), world.config);
		const claims = claimsOf(request.headers.authorization);
		assert.equal(claims.exp - claims.iat, 120);
		assert.equal(claims.is_admin, false);
		assert.notEqual(claims.platform_role, 'admin');
		assert.equal(claims.sub, OWNER);
		assert.deepEqual(claims.workspace_ids, [HOME]);
		assert.match(claims.jti, /^[0-9a-f-]{36}$/);
	});
});

describe('a request that is not a PAT is untouched', () => {
	it('reads with an app session as before, with no lookup and no audit row', async (t) => {
		const world = await startPatWorld(t);
		const answer = await send(world.base, PAGE_PATH, sessionHeaders(world.config, OWNER, HOME));
		assert.equal(answer.status, 200);
		assert.equal(answer.body.title, 'Plan');
		assert.equal(world.patStore.calls.length, 0);
	});

	it('does not hold an app session to the PAT allowlist', async (t) => {
		const world = await startPatWorld(t);
		const answer = await send(world.base, '/api/workspaces', sessionHeaders(world.config, OWNER, HOME));
		assert.notEqual(answer.body?.error, 'pat_route_not_allowed');
		assert.equal(world.patStore.calls.length, 0);
	});

	it('leaves a request with no header to the route', async (t) => {
		const world = await startPatWorld(t);
		const answer = await send(world.base, PAGE_PATH, {});
		assert.equal(answer.status, 401);
		assert.notEqual(answer.body.error, 'pat_invalid');
	});
});

describe('the mask fails closed', () => {
	const masked = (mask = ['title']) => {
		const response = fakeResponse();
		installResponseMask(response, mask);
		return response;
	};
	const reply = (response, status, body, headers = { 'content-type': 'application/json', 'content-length': '99' }) => {
		response.writeHead(status, headers);
		response.end(body);
		return response.sent;
	};

	it('masks a 2xx JSON body and drops its content-length', () => {
		const sent = reply(masked(), 200, JSON.stringify({ _id: 'p', title: 'T', content: ['secret body'] }));
		assert.equal(sent.head.status, 200);
		assert.deepEqual(JSON.parse(sent.body), { _id: 'p', title: 'T' });
		assert.deepEqual(Object.keys(sent.head.headers), ['content-type']);
	});

	const unmaskable = [
		['a body that is not JSON', 'plain <b>text</b> with the content'],
		['a JSON array', '[{"content":"x"}]'],
		['an empty 2xx body', ''],
	];
	for (const [name, body] of unmaskable) {
		it(`answers 500 pat_mask_failed for ${name} and never sends it`, () => {
			const sent = reply(masked(), 200, body);
			assert.equal(sent.head.status, 500);
			assert.equal(JSON.parse(sent.body).error, 'pat_mask_failed');
			assert.ok(!sent.body.includes('content'));
		});
	}

	it('passes an error body through unchanged', () => {
		const body = JSON.stringify({ ok: false, message: 'Page not found.' });
		const sent = reply(masked(), 404, body);
		assert.equal(sent.head.status, 404);
		assert.equal(sent.body, JSON.stringify({ ok: false, message: 'Not found.' }));
	});

	it('refuses a masked route that streams with 500 pat_route_streams', () => {
		assert.throws(() => masked().write('chunk'), (error) => error.status === 500 && error.code === 'pat_route_streams');
	});
});

describe('the gate compares no secret and no hash in JavaScript', () => {
	it('has no === next to a hash or a secret', () => {
		const source = readFileSync(new URL('../../scripts/bridge-pat-middleware.mjs', import.meta.url), 'utf8');
		const offending = source.split('\n').filter((line) => /(hash|secret)/i.test(line) && /[!=]==/.test(line));
		assert.deepEqual(offending, []);
	});
});

describe('the gate bounds what an anonymous client can make it do', () => {
	it('answers 429 with retry-after once a client passes its bucket, and stops reading the token table', async (t) => {
		const world = await startPatWorld(t, { rateLimit: { limit: 5, windowMs: 60_000 } });
		const answers = [];
		for (let index = 0; index < 200; index += 1) answers.push(await fetch(`${world.base}${PAGE_PATH}`, { headers: bearer(mintPatSecret().secret) }));
		const statuses = answers.map((answer) => answer.status);
		assert.equal(statuses.filter((status) => status === 401).length, 5);
		assert.equal(statuses.filter((status) => status === 429).length, 195);
		assert.equal(answers.at(-1).headers.get('retry-after'), '60');
		assert.equal(world.patStore.callsTo(PAT_TABLE).length, 5);
	});

	it('counts a bearer of the wrong shape too, so garbage is not free', async (t) => {
		const world = await startPatWorld(t, { rateLimit: { limit: 2, windowMs: 60_000 } });
		const statuses = [];
		for (let index = 0; index < 4; index += 1) statuses.push((await send(world.base, PAGE_PATH, bearer('osio_pat_short'))).status);
		assert.deepEqual(statuses, [401, 401, 429, 429]);
	});

	it('leaves a request without an osio_ bearer out of the bucket', async (t) => {
		const world = await startPatWorld(t, { rateLimit: { limit: 1, windowMs: 60_000 } });
		for (let index = 0; index < 3; index += 1) await send(world.base, PAGE_PATH, { authorization: 'Bearer something-else' });
		assert.equal(world.kv.keys().filter((key) => key.includes('rl:')).length, 0);
	});
});

describe('a PAT-shaped bearer that is not a PAT is answered like any bad token', () => {
	for (const presented of ['osio_x', 'osio_pat', 'osio_other_abc']) {
		it(`answers ${presented} with 401 pat_invalid and no lookup`, async (t) => {
			const world = await startPatWorld(t);
			const answer = await send(world.base, PAGE_PATH, bearer(presented));
			assert.equal(answer.text, '{"error":"pat_invalid"}');
			assert.equal(world.patStore.callsTo(PAT_TABLE).length, 0);
		});
	}
});

describe('the hourly use is recorded once, and never lost to a failed audit', () => {
	const patches = (world) => world.patStore.callsTo(PAT_TABLE).filter((call) => call.method === 'PATCH');

	it('claims with one conditional PATCH, and skips it while the last use is within the hour', async (t) => {
		const { world, secret } = await viaPat(t, {});
		await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(patches(world).length, 1);
		assert.match(patches(world)[0].params.get('or'), /^\(last_used_at\.is\.null,last_used_at\.lt\./);
		await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(patches(world).length, 1);
	});

	it('leaves last_used_at null when the audit write fails, so the next request audits', async (t) => {
		let failing = true;
		const { world, secret } = await viaPat(t, {}, {}, { fail: (call) => (failing && call.table === 'osionos_bridge_audit_events' ? { status: 500 } : null) });
		const first = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(first.status, 503);
		assert.equal(world.patStore.rows(PAT_TABLE)[0].last_used_at, null);
		failing = false;
		const second = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(second.status, 200);
		assert.equal(lastUse(world).length, 1);
		assert.ok(world.patStore.rows(PAT_TABLE)[0].last_used_at);
	});
});

describe('every store failure behind the gate is a 503', () => {
	const failing = (status) => (inner) => (url, init) => (String(url).includes('/osionos_workspaces') ? Promise.resolve(new Response('{}', { status, headers: { 'content-type': 'application/json' } })) : inner(url, init));

	for (const status of [500, 401, 404]) {
		it(`answers 503 when the workspace read answers ${status}`, async (t) => {
			const { world, secret } = await viaPat(t, {});
			await assert.rejects(world.gateWith(failing(status))(fakeRequest(secret), fakeResponse(), new URL(`http://bridge.test${PAGE_PATH}`), world.config), (error) => error.status === 503);
		});
	}

	it('answers 503 when the token store answers something that is not a list', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const odd = (inner) => (url, init) => (String(url).includes(`/${PAT_TABLE}`) ? Promise.resolve(new Response('{"message":"odd"}', { status: 200, headers: { 'content-type': 'application/json' } })) : inner(url, init));
		await assert.rejects(world.gateWith(odd)(fakeRequest(secret), fakeResponse(), new URL(`http://bridge.test${PAGE_PATH}`), world.config), (error) => error.status === 503);
	});

	it('refuses a workspace row that another user owns, with 503', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const foreign = (inner) => (url, init) => (String(url).includes('/osionos_workspaces') ? Promise.resolve(new Response(JSON.stringify([{ id: HOME, owner_id: '99999999-9999-4999-8999-999999999999' }]), { status: 200, headers: { 'content-type': 'application/json' } })) : inner(url, init));
		await assert.rejects(world.gateWith(foreign)(fakeRequest(secret), fakeResponse(), new URL(`http://bridge.test${PAGE_PATH}`), world.config), (error) => error.status === 503);
	});
});

describe('a write body has to be an object', () => {
	for (const [name, body] of [['an array', '[{"title":"x"}]'], ['null', 'null'], ['a number', '7'], ['a string', '"title"']]) {
		it(`refuses ${name} with 422 and writes nothing`, async (t) => {
			const { world, secret } = await viaPat(t, fineGrained(['title'], ['read', 'write']));
			const answer = await send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body });
			assert.equal(answer.status, 422);
			assert.equal(world.pages.page(PAGE).title, 'Plan');
		});
	}

	it('throws pat_invalid_body from patWritePayload for a non-object', () => {
		for (const payload of [[], null, 3, 'x']) assert.throws(() => patWritePayload(payload, ['title']), (error) => error.status === 422 && error.code === 'pat_invalid_body');
	});
});

describe('the gate runs on the server clock', () => {
	it('refuses as expired a token that is past its expiry on the pinned clock', async (t) => {
		const { secret, row } = patRow({ expiresAt: '2030-01-01T00:00:00.000Z' });
		const world = await startPatWorld(t, { tokens: [row], now: () => Date.parse('2030-01-02T00:00:00.000Z') });
		const answer = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(answer.status, 401);
		assert.equal(lastUse(world)[0].details.outcome, 'expired');
	});

	it('stamps the session and the last use with the pinned clock', async (t) => {
		const pinned = Date.parse('2030-01-01T00:00:00.000Z');
		const { secret, row } = patRow({ expiresAt: '2031-01-01T00:00:00.000Z' });
		const world = await startPatWorld(t, { tokens: [row], now: () => pinned });
		const request = fakeRequest(secret);
		assert.equal(await world.gate(request, fakeResponse(), new URL(`http://bridge.test${PAGE_PATH}`), world.config), false);
		assert.equal(claimsOf(request.headers.authorization.slice('Bearer '.length)).iat, pinned / 1000);
		assert.equal(world.patStore.rows(PAT_TABLE)[0].last_used_at, new Date(pinned).toISOString());
	});
});

describe('the two page routes are answered by the page handlers', () => {
	it('reads through the page read handler', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const answer = await send(world.base, PAGE_PATH, bearer(secret));
		assert.equal(answer.status, 200);
		assert.ok(world.pages.calls.some((call) => call.method === 'GET' && call.table === 'osionos_pages'));
	});

	it('writes through the page update handler', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title'], ['read', 'write']));
		const answer = await send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: JSON.stringify({ title: 'Renamed' }) });
		assert.equal(answer.body.ok, true);
		assert.ok(world.pages.calls.some((call) => call.method === 'PATCH' && call.table === 'osionos_pages'));
	});
});

describe('a PAT client never sees upstream error text', () => {
	const leak = 'SECRET-ROW-VALUE-7f3a';

	it('replaces the message of a store refusal with a fixed sentence and keeps the code', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title'], ['read', 'write']), {}, {
			pageFail: (call) => (call.table === 'osionos_pages' && call.method === 'PATCH' ? { status: 400, body: { code: '23514', message: `new row for relation "osionos_pages" violates check constraint. Failing row contains (${leak})` } } : null),
		});
		const answer = await send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body: JSON.stringify({ title: 'Renamed' }) });
		assert.ok(answer.status >= 400);
		assert.ok(!answer.text.includes(leak), answer.text);
		assert.equal(typeof answer.body.message, 'string');
		assert.ok(answer.body.code !== undefined || answer.body.ok === false);
	});

	it('gives the same sentence to the same status whatever the upstream said', () => {
		const send404 = (message) => {
			const response = fakeResponse();
			installResponseMask(response, ['title']);
			response.writeHead(404, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ ok: false, code: 'not_found', message }));
			return JSON.parse(response.sent.body);
		};
		assert.deepEqual(send404('one value'), send404('another value'));
		assert.equal(send404('x').code, 'not_found');
	});
});

describe('the write reply follows the read mask', () => {
	const archive = JSON.stringify({ archivedAt: '2026-10-23T00:00:00.000Z' });
	const grant = (read, write) => ({ kind: 'fine_grained', scopes: [], grants: [{ resource: 'pages', attributes: write, permissions: ['write'] }, ...(read.length ? [{ resource: 'pages', attributes: read, permissions: ['read'] }] : [])] });
	const reply = async (t, spec, body) => {
		const { world, secret } = await viaPat(t, spec);
		return send(world.base, PAGE_PATH, bearer(secret), { method: 'PATCH', body });
	};

	it('sends ok and updatedAt, and no version, to a token that cannot read content', async (t) => {
		const answer = await reply(t, grant(['title'], ['title']), JSON.stringify({ title: 'Renamed' }));
		assert.equal(answer.status, 200);
		assert.deepEqual(Object.keys(answer.body).sort(), ['ok', 'updatedAt']);
	});

	it('adds version once the read mask covers content', async (t) => {
		const answer = await reply(t, grant(['content'], ['title']), JSON.stringify({ title: 'Renamed' }));
		assert.ok(Object.hasOwn(answer.body, 'version'));
	});

	it('withholds cascadedIds unless the read mask covers archivedAt', async (t) => {
		const without = await reply(t, grant(['title'], ['archivedAt']), archive);
		assert.equal(without.status, 200);
		assert.ok(!Object.hasOwn(without.body, 'cascadedIds'));
		const withIt = await reply(t, grant(['archivedAt'], ['archivedAt']), archive);
		assert.ok(Array.isArray(withIt.body.cascadedIds));
	});
});

describe('a members outage is not an empty member list', () => {
	it('answers 503 from the gate when the member read throws', async (t) => {
		const { world, secret } = await viaPat(t, {});
		const gate = world.gateWith(undefined, { memberWorkspaceEntries: async () => { throw new Error('members down'); } });
		await assert.rejects(gate(fakeRequest(secret), fakeResponse(), new URL(`http://bridge.test${PAGE_PATH}`), world.config), (error) => error.status === 503);
	});

	it('lets memberWorkspaceEntries throw when asked to be strict, and swallow by default', async () => {
		const config = { serviceKey: 'k', baasUrl: 'http://baas.test' };
		const down = async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } });
		assert.deepEqual(await memberWorkspaceEntries(OWNER, [], config, down), []);
		await assert.rejects(memberWorkspaceEntries(OWNER, [], config, down, { strict: true }));
	});
});
