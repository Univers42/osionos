/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-config-versions.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Devil 2026-10-28 (L2): the bridge drops a `versions` key from the config PATCH
// before the upsert, so old web/desktop builds stop storing private version
// snapshots on the server. A config that already carries none is stored unchanged.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);

const snapshot = () => ({
	id: 'v1', userId: IDS.userA, pageId: IDS.sharedA, title: 'Draft',
	content: [{ id: 'b1', type: 'paragraph', content: 'private snapshot text' }],
	createdAt: '2026-10-27T00:00:00.000Z', label: 'v1',
});

/** The config upsert the bridge sent to the fake BaaS: exactly one, or the assert fails. */
function upsertBody(mock) {
	const calls = mock.calls.filter((call) => call.method === 'POST' && call.table === 'osionos_page_configurations');
	assert.equal(calls.length, 1, 'one config upsert');
	return calls[0].body;
}

describe('PATCH /api/pages/:id/config stops storing version snapshots', () => {
	it('answers 200 and stores the config without the versions key', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.sharedA}/config`, asB, patch({ config: { font: 'serif', versions: [snapshot()], translations: [] } }));
			assert.equal(result.status, 200, result.text);
			const stored = upsertBody(mock).config;
			assert.equal(Object.hasOwn(stored, 'versions'), false, 'the upsert carries no versions');
			assert.deepEqual(stored, { font: 'serif', translations: [] });
			assert.deepEqual(mock.rows('osionos_page_configurations')[0].config, { font: 'serif', translations: [] }, 'the row the fake BaaS holds');
			assert.equal(result.body.config.font, 'serif');
			assert.equal(Object.hasOwn(result.body.config, 'versions'), false, 'the response carries no versions');
		});
	});

	it('stores a config with no versions key exactly as sent', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const input = { font: 'serif', translations: [] };
			const result = await send(base, `/api/pages/${IDS.sharedA}/config`, asB, patch({ config: input }));
			assert.equal(result.status, 200, result.text);
			assert.deepEqual(upsertBody(mock).config, input);
			assert.deepEqual(result.body.config, input);
		});
	});
});
