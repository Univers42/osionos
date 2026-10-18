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
			const denied = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.privateA}`, asB);
			assert.equal(denied.status, 404, denied.text);
			const shared = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.sharedA}`, asB);
			assert.deepEqual([shared.status, shared.body], [200, { template }]);
		});
	});

	it('refuses a non-member the template of a shared page, like the page itself', async () => {
		const world = teamWorld({ memberRole: 'viewer' });
		world.osionos_workspace_members = world.osionos_workspace_members.filter((row) => row.user_id !== IDS.userB);
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, TEMPLATE_PATH, asA, write(IDS.sharedA))).status, 200);
			const page = await send(base, `/api/pages/${IDS.sharedA}`, asB);
			const denied = await send(base, `${TEMPLATE_PATH}?databaseId=${IDS.sharedA}`, asB);
			assert.ok([403, 404].includes(denied.status), denied.text);
			assert.equal(denied.status, page.status);
			assert.equal(JSON.stringify(denied.body).includes('cover'), false);
		});
	});
});
