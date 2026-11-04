/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-marketplace-template.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// G6 F1: the shared header template of a database is stored under the system user, so the
// page gates — not the session alone — decide who may write or read it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const template = { layout: 'cover' };
const write = (databaseId) => post({ databaseId, template });
const TEMPLATE_PATH = '/api/marketplace/header-template';

describe('marketplace header template', () => {
	it('refuses B a write on a database page B cannot read, and stores nothing', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, TEMPLATE_PATH, asB, write(IDS.privateA));
			assert.equal(denied.status, 404, denied.text);
			assert.deepEqual(mock.rows('osionos_page_configurations'), []);
		});
	});

	it('refuses a read-only member a write on a page they can read', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'viewer' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, TEMPLATE_PATH, asB, write(IDS.sharedA));
			assert.equal(denied.status, 403, denied.text);
			assert.deepEqual(mock.rows('osionos_page_configurations'), []);
		});
	});

	it('lets the owner write, then B read only what B may read', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'viewer' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, TEMPLATE_PATH, asA, write(IDS.privateA))).status, 200);
			assert.equal((await send(base, TEMPLATE_PATH, asA, write(IDS.sharedA))).status, 200);
			const own = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.privateA}`, asA);
			assert.deepEqual([own.status, own.body], [200, { template }]);
			// A page B may not read answers like a missing one (C134): no template, never A's.
			const hidden = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.privateA}`, asB);
			assert.deepEqual([hidden.status, hidden.body], [200, { template: null }]);
			const shared = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.sharedA}`, asB);
			assert.deepEqual([shared.status, shared.body], [200, { template }]);
		});
	});

	it('withholds the template of a shared page from a non-member, as the page itself is withheld', async () => {
		const world = teamWorld({ memberRole: 'viewer' });
		world.osionos_workspace_members = world.osionos_workspace_members.filter((row) => row.user_id !== IDS.userB);
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, TEMPLATE_PATH, asA, write(IDS.sharedA))).status, 200);
			const page = await send(base, `/api/pages/${IDS.sharedA}`, asB);
			assert.equal(page.status, 404, page.text);
			const denied = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.sharedA}`, asB);
			assert.deepEqual([denied.status, denied.body], [200, { template: null }]);
		});
	});

	// Production's marketplace database has no page row, so every app page's read was a
	// console-logged 404 (2026-11-04). The gate's not-found is now an empty answer, read
	// before any configuration row, so nothing about the page leaks.
	it('answers no template, and reads no configuration, for a database page that does not exist', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'viewer' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const missing = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.missing}`, asA);
			assert.deepEqual([missing.status, missing.body], [200, { template: null }]);
			assert.equal(mock.calls.some((call) => call.table === 'osionos_page_configurations'), false);
		});
	});

	it('keeps the 403 of a member without the read permission on a page that exists', async () => {
		const world = teamWorld({ memberRole: 'viewer' });
		world.osionos_workspace_members.find((row) => row.user_id === IDS.userB).permissions = [];
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, TEMPLATE_PATH, asA, write(IDS.sharedA))).status, 200);
			const denied = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.sharedA}`, asB);
			assert.equal(denied.status, 403, denied.text);
			assert.equal(JSON.stringify(denied.body).includes('cover'), false);
		});
	});
});
