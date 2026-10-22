/* ************************************************************************** */
/*                                                                            */
/*   bridge-workspace-settings.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const WS = IDS.team;
const OWNER = IDS.userA;
const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
const MEMBER = IDS.userB;
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';

const asOwner = sessionHeaders(config, OWNER, IDS.homeA);
const asAdmin = sessionHeaders(config, ADMIN, 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1', [WS]);
const asMember = sessionHeaders(config, MEMBER, IDS.homeB, [WS]);
const asStranger = sessionHeaders(config, STRANGER, 'e1e1e1e1-5555-4555-8555-e1e1e1e1e1e1', [WS]);

const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];

function world({ owner = OWNER, settings = {}, members = [] } = {}) {
	return {
		osionos_workspaces: [{ id: WS, owner_id: owner, name: 'Team', slug: 'team', visibility: 'confidential', settings, updated_at: '2026-10-01T00:00:00.000Z' }],
		osionos_workspace_members: members,
	};
}

function backend({ seed = world(), ...rest } = {}) {
	const mock = createPostgrestMock(seed);
	return { ...mock, fetchImpl: mock.fetchImpl, ...rest };
}

const path = `/api/workspaces/${WS}/settings`;

describe('GET /api/workspaces/:id/settings', () => {
	it('owner, admin and member get exactly the six keys', async () => {
		const seed = world({ settings: { icon: '🚀', landingPageId: null, sidebar: { newSidebar: false, showApps: true, extra: 'x' }, analytics: { pageViews: false, enabled: true } }, members: [{ workspace_id: WS, user_id: ADMIN, role: 'admin', permissions: ALL_PERMISSIONS }, { workspace_id: WS, user_id: MEMBER, role: 'editor', permissions: ['read'] }] });
		for (const [label, headers] of [['owner', asOwner], ['admin', asAdmin], ['member', asMember]]) {
			const mock = backend({ seed });
			const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, headers));
			assert.equal(result.status, 200, `${label}: ${result.text}`);
			assert.deepEqual(Object.keys(result.body).sort(), ['analytics', 'icon', 'landingPageId', 'name', 'sidebar', 'visibility'].sort());
			assert.equal(result.body.name, 'Team');
			assert.equal(result.body.icon, '🚀');
			assert.deepEqual(result.body.sidebar, { newSidebar: false, showApps: true });
			assert.deepEqual(result.body.analytics, { pageViews: false });
		}
	});

	it('owner without a member row still reads (C1)', async () => {
		const mock = backend({ seed: world({ members: [] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner));
		assert.equal(result.status, 200, result.text);
	});

	it('stranger gets 404 workspace_not_found', async () => {
		const mock = backend({ seed: world({ members: [{ workspace_id: WS, user_id: MEMBER, role: 'editor', permissions: ['read'] }] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asStranger));
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'workspace_not_found');
	});

	it('absent keys come back as defaults', async () => {
		const mock = backend({ seed: world({ settings: {} }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner));
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.icon, '🌏');
		assert.equal(result.body.landingPageId, null);
		assert.deepEqual(result.body.sidebar, { newSidebar: true, showApps: true });
		assert.deepEqual(result.body.analytics, { pageViews: true });
	});
});

describe('PATCH /api/workspaces/:id/settings', () => {
	it('owner writes and reads back merged', async () => {
		const mock = backend({ seed: world({ settings: { icon: '🌏', sidebar: { newSidebar: true, showApps: true }, analytics: { pageViews: true } } }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ icon: '🎯' })));
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.icon, '🎯');
		assert.deepEqual(result.body.sidebar, { newSidebar: true, showApps: true });
		// persisted
		const row = mock.rows('osionos_workspaces')[0];
		assert.equal(row.settings.icon, '🎯');
	});

	it('admin writes', async () => {
		const mock = backend({ seed: world({ members: [{ workspace_id: WS, user_id: ADMIN, role: 'admin', permissions: ALL_PERMISSIONS }] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asAdmin, patch({ name: 'Renamed' })));
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.name, 'Renamed');
	});

	it('member gets 403 and nothing written', async () => {
		const mock = backend({ seed: world({ members: [{ workspace_id: WS, user_id: MEMBER, role: 'editor', permissions: ['read'] }] }) });
		const before = JSON.stringify(mock.rows('osionos_workspaces')[0].settings);
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asMember, patch({ icon: '🎯' })));
		assert.equal(result.status, 403, result.text);
		const after = JSON.stringify(mock.rows('osionos_workspaces')[0].settings);
		assert.equal(after, before);
	});

	it('stranger gets 404', async () => {
		const mock = backend({ seed: world({ members: [{ workspace_id: WS, user_id: MEMBER, role: 'editor', permissions: ['read'] }] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asStranger, patch({ icon: '🎯' })));
		assert.equal(result.status, 404, result.text);
	});

	it('merge: only icon leaves sidebar untouched', async () => {
		const mock = backend({ seed: world({ settings: { icon: '🌏', sidebar: { newSidebar: false, showApps: true }, analytics: { pageViews: true } } }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ icon: '🎯' })));
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.body.sidebar, { newSidebar: false, showApps: true });
	});

	it('null removes the key', async () => {
		const mock = backend({ seed: world({ settings: { icon: '🌏' } }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ icon: null })));
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.icon, '🌏'); // default
		const row = mock.rows('osionos_workspaces')[0];
		assert.equal(Object.hasOwn(row.settings, 'icon'), false);
	});

	it('PATCH answer is full merged object', async () => {
		const mock = backend({ seed: world({ settings: {} }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ sidebar: { newSidebar: false } })));
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(Object.keys(result.body).sort(), ['analytics', 'icon', 'landingPageId', 'name', 'sidebar', 'visibility'].sort());
		assert.deepEqual(result.body.sidebar, { newSidebar: false, showApps: true });
	});

	it('unknown top-level key -> 422 field_not_editable naming it', async () => {
		const mock = backend({ seed: world() });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ visibility: 'public' })));
		assert.equal(result.status, 422, result.text);
		assert.equal(result.body.code, 'field_not_editable');
	});

	it('unknown key inside sidebar -> 422 field_not_editable', async () => {
		const mock = backend({ seed: world() });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ sidebar: { foo: true } })));
		assert.equal(result.status, 422, result.text);
		assert.equal(result.body.code, 'field_not_editable');
	});

	it('empty name -> 422 invalid_field', async () => {
		const mock = backend({ seed: world() });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ name: '   ' })));
		assert.equal(result.status, 422, result.text);
		assert.equal(result.body.code, 'invalid_field');
	});

	it('66-char name -> 422 invalid_field', async () => {
		const mock = backend({ seed: world() });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ name: 'a'.repeat(66) })));
		assert.equal(result.status, 422, result.text);
		assert.equal(result.body.code, 'invalid_field');
	});

	it('stored unknown nested key normalises on read (C4)', async () => {
		const mock = backend({ seed: world({ settings: { analytics: { enabled: false } } }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner));
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.body.analytics, { pageViews: true });
	});

	it('visibility in body -> 422 field_not_editable', async () => {
		const mock = backend({ seed: world() });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ visibility: 'public' })));
		assert.equal(result.status, 422, result.text);
	});

	it('reset body restricted to five allowlisted keys (C3)', async () => {
		// simulate client reset sending only five keys
		const mock = backend({ seed: world({ settings: { icon: '🌏' } }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ name: 'Team', icon: '🌏', landingPageId: null, sidebar: { newSidebar: true, showApps: true }, analytics: { pageViews: true } })));
		assert.equal(result.status, 200, result.text);
	});

	it('icon removal sends icon: null removes key (C3)', async () => {
		const mock = backend({ seed: world({ settings: { icon: '🌏' } }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, path, asOwner, patch({ icon: null })));
		assert.equal(result.status, 200, result.text);
		const row = mock.rows('osionos_workspaces')[0];
		assert.equal(Object.hasOwn(row.settings, 'icon'), false);
	});
});

describe('route mounting', () => {
	it('an unknown workspace answers this module 404 code', async () => {
		const mock = backend({ seed: world() });
		const other = '99999999-9999-4999-8999-999999999999';
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/workspaces/${other}/settings`, asOwner));
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'workspace_not_found');
	});
});
