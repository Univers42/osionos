/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-content-version.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page mapper and the content version. The client saves a page under the version of
// its content it last saw, so the bridge has to tell it which version the row is at —
// and to stay silent when the database has no such column yet (the migration ships
// separately, and every select that carries content reads '*', so the column comes for
// free where it exists and is simply missing where it does not).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const PAGE = IDS.sharedA;
const asOwner = sessionHeaders(config, IDS.userA, IDS.homeA);

describe('the page mapper and the content version', () => {
	it('carries the version of a row that has one', async () => {
		const seeded = teamWorld();
		const page = seeded.osionos_pages.find((row) => row.id === PAGE);
		page.version = 6;
		const mock = createPostgrestMock(seeded);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const res = await send(base, `/api/pages/${PAGE}`, asOwner);
			assert.equal(res.status, 200, res.text);
			assert.equal(res.body.contentVersion, 6);
		});
	});

	it('omits it on a row without the column — the database that has no version yet', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const res = await send(base, `/api/pages/${PAGE}`, asOwner);
			assert.equal(res.status, 200, res.text);
			assert.equal('contentVersion' in res.body, false, 'a row without a version has none to give');
		});
	});

	it('never turns a missing version into a version of zero', async () => {
		const seeded = teamWorld();
		const page = seeded.osionos_pages.find((row) => row.id === PAGE);
		page.version = null;
		const mock = createPostgrestMock(seeded);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const res = await send(base, `/api/pages/${PAGE}`, asOwner);
			assert.equal(res.status, 200, res.text);
			assert.equal('contentVersion' in res.body, false);
		});
	});
});
