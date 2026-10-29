/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-f4b-attribute-targets.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bestShareLevel, attributeRuleMatches } from '../../scripts/bridge-share-rules.mjs';
import { normalizeShareRule } from '../../scripts/bridge-perms-rules.mjs';
import { createMemberAttributesHandler } from '../../scripts/bridge-member-attributes.mjs';
import { scanAccessWriters } from './support/access-writers-scan.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { accessTicket } from '../../scripts/bridge-access-generation.mjs';

const WS = '33333333-3333-4333-8333-333333333333';
const OTHER_WS = '77777777-7777-4777-8777-777777777777';

function attrRule(permission, over = {}) {
	return { resource_type: 'page', resource_id: 'p1', workspace_id: WS, target: { type: 'attribute', name: 'role', value: 'admin' }, permission, ...over };
}

describe('F4b attribute targets', () => {
	it('C640: best-of with deny-wins across user/role/team/attribute targets', () => {
		const ctx = { userId: 'u1', role: 'member', workspaceId: WS, teamIds: ['t1'], attributes: [{ name: 'role', value: 'admin' }] };
		// attribute grant does not outrank a user no_access
		const rules1 = [
			attrRule('can_edit'),
			{ resource_type: 'page', resource_id: 'p1', target: { type: 'user', userId: 'u1' }, permission: 'no_access' },
		];
		assert.equal(bestShareLevel(rules1, ctx, 'p1'), 'no_access');
		// attribute no_access beats a user can_edit
		const rules2 = [
			{ resource_type: 'page', resource_id: 'p1', target: { type: 'user', userId: 'u1' }, permission: 'can_edit' },
			attrRule('no_access'),
		];
		assert.equal(bestShareLevel(rules2, ctx, 'p1'), 'no_access');
		// best-of grants otherwise
		const rules3 = [
			{ resource_type: 'page', resource_id: 'p1', target: { type: 'role', role: 'member' }, permission: 'can_view' },
			attrRule('can_edit'),
		];
		assert.equal(bestShareLevel(rules3, ctx, 'p1'), 'can_edit');
	});

	it('C641: unknown target type still returns null; bad attribute targets are 400 before any call', () => {
		const unknown = { workspaceId: WS, resourceId: 'p1', permission: 'can_view', target: { type: 'squad', name: 'role' } };
		assert.throws(() => normalizeShareRule(unknown), (e) => e.status === 400);
		// bestShareLevel ignores unknown target
		const rules = [{ resource_type: 'page', resource_id: 'p1', target: { type: 'squad' }, permission: 'can_view' }];
		const ctx = { userId: 'u1', role: 'member', workspaceId: WS, teamIds: [], attributes: [{ name: 'role', value: 'admin' }] };
		assert.equal(bestShareLevel(rules, ctx, 'p1'), null);

		const bad = [
			{ type: 'attribute', name: 'Role', value: 'admin' },
			{ type: 'attribute', name: 'a'.repeat(33), value: 'admin' },
			{ type: 'attribute', name: 'role', value: '' },
			{ type: 'attribute', name: 'role', value: 'x'.repeat(65) },
			{ type: 'attribute', name: 'role', value: 'a:b' },
			{ type: 'attribute', name: 'role', value: ' x' },
			{ type: 'attribute', name: 'role', value: 'x\x01' },
		];
		for (const target of bad) {
			assert.throws(() => normalizeShareRule({ workspaceId: WS, resourceId: 'p1', permission: 'can_view', target }), (e) => e.status === 400, JSON.stringify(target));
		}
	});

	it('C642: ctx.attributes null -> grant matches nobody, no_access still matches', () => {
		const grantRule = [attrRule('can_view')];
		const denyRule = [attrRule('no_access')];
		const ctx = { userId: 'u1', role: 'member', workspaceId: WS, teamIds: [], attributes: null };
		assert.equal(bestShareLevel(grantRule, ctx, 'p1'), null);
		assert.equal(bestShareLevel(denyRule, ctx, 'p1'), 'no_access');
		// matcher direct
		assert.equal(attributeRuleMatches(attrRule('can_view'), { type: 'attribute', name: 'role', value: 'admin' }, ctx), false);
		assert.equal(attributeRuleMatches(attrRule('no_access'), { type: 'attribute', name: 'role', value: 'admin' }, ctx), true);
	});

	it('C645: a guest principal never matches an attribute target', () => {
		const ctx = { userId: 'g1', role: 'guest', workspaceId: WS, teamIds: [], attributes: [{ name: 'role', value: 'admin' }] };
		assert.equal(attributeRuleMatches(attrRule('can_view'), { type: 'attribute', name: 'role', value: 'admin' }, ctx), false);
		assert.equal(bestShareLevel([attrRule('can_view')], ctx, 'p1'), null);
	});

	it('C644: bridge and AI matchers agree on the shared attribute fixture', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const fixture = JSON.parse(readFileSync(join(here, 'fixtures', 'attribute-parity.json'), 'utf8'));
		for (const c of fixture.cases) {
			const perm = c.permission ?? fixture.permission;
			const rule = { resource_type: 'page', resource_id: 'p1', workspace_id: fixture.ruleWorkspaceId ?? 'w1', target: { type: 'attribute', name: fixture.rule.name, value: fixture.rule.value }, permission: perm };
			const ctx = { userId: 'u1', role: c.guest ? 'guest' : 'member', workspaceId: c.workspaceId, teamIds: [], attributes: c.attributes };
			const matched = attributeRuleMatches(rule, rule.target, ctx);
			assert.equal(matched, c.expectedMatch, c.name);
		}
	});

	it('C643: member-attribute routes enforce admin writes and read access', async () => {
		const { harnessConfig } = await import('./support/bridge-harness.mjs');
		const config = harnessConfig();
		const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
		const MEMBER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
		const OTHER = 'cccccccc-3333-4333-8333-cccccccccccc';
		const { verifySession } = await import('../../scripts/bridge-api.mjs').then((m) => ({ verifySession: (t) => ({ userId: t === 'owner' ? OWNER : (t === 'member' ? MEMBER : OTHER), workspaceIds: [WS] }) }));
		// simple fetch stub backed by in-memory state
		const members = [{ workspace_id: WS, user_id: MEMBER, role: 'member', permissions: ['read'] },
			{ workspace_id: WS, user_id: OWNER, role: 'owner', permissions: ['admin'] }];
		const attrs = [];
		const fetchImpl = async (url, init = {}) => {
			const u = new URL(url);
			const table = u.pathname.split('/').pop();
			const method = init.method ?? 'GET';
			if (table === 'osionos_workspaces') return new Response(JSON.stringify([{ id: WS, owner_id: OWNER }]), { status: 200, headers: { 'content-type': 'application/json' } });
			if (table === 'osionos_workspace_members') {
				// membership lookup: user_id filter present
				if (u.searchParams.get('user_id')) {
					const uid = u.searchParams.get('user_id').replace('eq.', '');
					const row = members.find((m) => m.user_id === uid && m.workspace_id === WS);
					return new Response(JSON.stringify(row ? [row] : []), { status: 200, headers: { 'content-type': 'application/json' } });
				}
				return new Response(JSON.stringify(members), { status: 200, headers: { 'content-type': 'application/json' } });
			}
			if (table === 'osionos_member_attributes') {
				if (method === 'GET') {
					const uid = u.searchParams.get('user_id').replace('eq.', '');
					return new Response(JSON.stringify(attrs.filter((a) => a.user_id === uid)), { status: 200, headers: { 'content-type': 'application/json' } });
				}
				if (method === 'POST') {
					const body = JSON.parse(init.body);
					const row = { workspace_id: body.workspace_id, user_id: body.user_id, name: body.name, value: body.value };
					const idx = attrs.findIndex((a) => a.workspace_id === row.workspace_id && a.user_id === row.user_id && a.name === row.name);
					if (idx >= 0) attrs[idx] = row; else attrs.push(row);
					return new Response(JSON.stringify([row]), { status: 200, headers: { 'content-type': 'application/json' } });
				}
				if (method === 'DELETE') {
					const uid = u.searchParams.get('user_id').replace('eq.', '');
					const name = u.searchParams.get('name').replace('eq.', '');
					const idx = attrs.findIndex((a) => a.user_id === uid && a.name === name);
					if (idx < 0) return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
					const removed = attrs.splice(idx, 1);
					return new Response(JSON.stringify(removed), { status: 200, headers: { 'content-type': 'application/json' } });
				}
			}
			return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
		};
		const handler = createMemberAttributesHandler({ config, verifySession: (t) => ({ userId: t === 'owner' ? OWNER : (t === 'member' ? MEMBER : OTHER), workspaceIds: [WS] }), fetchImpl });
		// owner PUT ok + bump
		const before = accessTicket('x', WS).workspaceGeneration;
		const { send, withBridge, sessionHeaders } = await import('./support/bridge-harness.mjs');
		const ownerHeaders = sessionHeaders(config, OWNER, WS, [WS]);
		const memberHeaders = sessionHeaders(config, MEMBER, WS, [WS]);
		// owner PUT
		const r1 = await withBridge(config, fetchImpl, (base) => send(base, `/api/workspaces/${WS}/members/${MEMBER}/attributes/role`, ownerHeaders, { method: 'PUT', body: JSON.stringify({ value: 'admin' }) }));
		// send helper signature? bridge-harness send(base, path, headers, init)
		assert.equal(r1.status, 200, r1.text);
		const after = accessTicket('x', WS).workspaceGeneration;
		assert.notEqual(before, after, 'bumpAccessAfter should bump');

		// member reading own -> 200
		const r2 = await withBridge(config, fetchImpl, (base) => send(base, `/api/workspaces/${WS}/members/${MEMBER}/attributes`, memberHeaders));
		assert.equal(r2.status, 200, r2.text);
		// member reading another's -> 403
		const r3 = await withBridge(config, fetchImpl, (base) => send(base, `/api/workspaces/${WS}/members/${OTHER}/attributes`, memberHeaders));
		assert.equal(r3.status, 403, r3.text);
		// member writing own -> 403
		const r4 = await withBridge(config, fetchImpl, (base) => send(base, `/api/workspaces/${WS}/members/${MEMBER}/attributes/role`, memberHeaders, { method: 'PUT', body: JSON.stringify({ value: 'admin' }) }));
		assert.equal(r4.status, 403, r4.text);
		// target not a live member -> 404
		const r5 = await withBridge(config, fetchImpl, (base) => send(base, `/api/workspaces/${WS}/members/${OTHER}/attributes/role`, ownerHeaders, { method: 'PUT', body: JSON.stringify({ value: 'admin' }) }));
		// OTHER is not a member in our stub (not in members) => 404
		assert.equal(r5.status, 404, r5.text);
		// owner DELETE ok
		const r6 = await withBridge(config, fetchImpl, (base) => send(base, `/api/workspaces/${WS}/members/${MEMBER}/attributes/role`, ownerHeaders, { method: 'DELETE' }));
		assert.equal(r6.status, 200, r6.text);
	});

	it('C643: access-writers scan sees bridge-member-attributes.mjs', () => {
		const source = readFileSync(new URL('../../scripts/bridge-member-attributes.mjs', import.meta.url), 'utf8');
		const { writers } = scanAccessWriters('scripts/bridge-member-attributes.mjs', source);
		assert.ok(writers.length > 0);
		assert.equal(writers.some((w) => !w.bumped), false);
	});
});