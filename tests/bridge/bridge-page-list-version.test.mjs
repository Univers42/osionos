/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-list-version.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * #82: the metadata-only hydrate (/api/pages/all) carries each page's content version,
 * so a device learns another device's write from the list — not only from a 409 —
 * and still ships no content.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const PAGE = 'a2000000-0000-4000-8000-000000000001';

function world() {
	const base = teamWorld();
	base.osionos_pages = [{
		id: PAGE, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: 'Versioned',
		collaborators: [], properties: [], parent_page_id: null, archived_at: null, version: 5,
		content: [{ id: 'b1', type: 'paragraph', content: 'body' }],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	}];
	return base;
}

describe('GET /api/pages/all carries the content version', () => {
	it('lists the version of each page and no content', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, sessionHeaders(config, IDS.userA, IDS.homeA));
			assert.equal(answer.status, 200, answer.text);
			const entry = answer.body.find((row) => row._id === PAGE);
			assert.equal(entry.contentVersion, 5);
			assert.equal(Object.hasOwn(entry, 'content'), false);
		});
	});
});
