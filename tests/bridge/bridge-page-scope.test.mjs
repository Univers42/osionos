/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-scope.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Page-scoped side routes (per-user config, page actions, favorites) answer a page the
// member cannot read exactly like a random id, and write nothing under its workspace.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const comparable = ({ pageId, updatedAt, eventId, ...rest }) => rest;
const SCOPED = {
	'config GET': [(id) => `/api/pages/${id}/config`, undefined],
	'config PATCH': [(id) => `/api/pages/${id}/config`, patch({ config: { view: 'board' } })],
	'actions POST': [(id) => `/api/pages/${id}/actions`, post({ action: 'duplicate', payload: {} })],
};

describe('page-scoped routes treat an unreadable page like a missing id', () => {
	for (const memberRole of ['viewer', 'editor']) {
		for (const [name, [pathFor, init]] of Object.entries(SCOPED)) {
			it(`${memberRole}: ${name}`, async () => {
				const mock = createPostgrestMock(teamWorld({ memberRole }));
				await withBridge(config, mock.fetchImpl, async (base) => {
					const denied = await send(base, pathFor(IDS.privateA), asB, init);
					const missing = await send(base, pathFor(IDS.missing), asB, init);
					assert.equal(denied.status, missing.status, denied.text);
					assert.deepEqual(comparable(denied.body), comparable(missing.body));
					const written = [...mock.rows('osionos_page_configurations'), ...mock.rows('osionos_page_action_events')];
					assert.deepEqual(written.filter((row) => row.workspace_id === IDS.team), []);
				});
			});
		}
	}

	it('still scopes a readable page to its own workspace', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const saved = await send(base, `/api/pages/${IDS.sharedA}/config`, asB, patch({ config: { view: 'board' } }));
			assert.equal(saved.status, 200, saved.text);
			assert.equal(mock.rows('osionos_page_configurations')[0].workspace_id, IDS.team);
		});
	});
});

describe('favorites', () => {
	it('404s starring an unreadable page exactly like a missing id and stores nothing', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, '/api/favorites', asB, post({ pageId: IDS.privateA }));
			const missing = await send(base, '/api/favorites', asB, post({ pageId: IDS.missing }));
			assert.equal(denied.status, 404, denied.text);
			assert.deepEqual([denied.status, denied.body], [missing.status, missing.body]);
			assert.deepEqual(mock.rows('osionos_page_favorites'), []);
			assert.equal((await send(base, '/api/favorites', asB, post({ pageId: IDS.sharedA }))).status, 200);
			assert.equal(mock.rows('osionos_page_favorites').length, 1);
		});
	});
});
