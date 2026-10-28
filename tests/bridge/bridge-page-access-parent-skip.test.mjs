/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-parent-skip.test.mjs            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The id → parent_page_id map is read only when the workspace has a share rule
 * (perf 2026-10-27: 8734 pages / ~1 MB downloaded to evaluate 3 rules). A workspace
 * with no rule is answered by the visibility rule alone — exactly develop's list —
 * and never pays for the parent read on list, search, graph or a single page read.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readablePageRows } from '../../scripts/bridge-page-read.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const ROOT = 'a1000000-0000-4000-8000-000000000001';
const CHILD = 'a1000000-0000-4000-8000-000000000002';
const RULE = 'a1000000-0000-4000-8000-0000000000f1';

/** The selectors the access loader uses for its id → parent map read (X1: grant workspaces add owner_id,visibility). */
const PARENT_SELECT = 'id,parent_page_id';
const PARENT_META_SELECT = 'id,parent_page_id,owner_id,visibility';

function parentSelects(mock) {
	return mock.calls
		.filter((call) => call.table === 'osionos_pages' && [PARENT_SELECT, PARENT_META_SELECT].includes(call.params.get('select')))
		.map((call) => call.params.get('select'));
}

function parentReads(mock) {
	return parentSelects(mock).length;
}

/** A ruled workspace: one can_view on ROOT, so every page surface must load the chain. */
function ruledWorld(permission = 'can_view') {
	const base = teamWorld();
	base.osionos_pages.push(
		teamPage(ROOT, IDS.userA, 'shared', 'Root', 'root body'),
		{ ...teamPage(CHILD, IDS.userA, 'shared', 'Child', 'child body'), parent_page_id: ROOT },
	);
	base.osionos_share_rules = [{
		id: RULE, workspace_id: IDS.team, resource_type: 'page', resource_id: ROOT,
		target: { type: 'user', userId: IDS.userB }, permission, explicit: true,
	}];
	return base;
}

describe('a workspace with no share rule skips the parent map', () => {
	it('list, search, graph and a page read issue ZERO id → parent_page_id reads', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const paths = [
				`/api/pages?workspaceId=${IDS.team}`,
				`/api/pages/all?workspaceId=${IDS.team}`,
				`/api/pages/search?workspaceId=${IDS.team}&q=notes`,
				`/api/graph/pages?workspaceId=${IDS.team}`,
				`/api/graph/data?workspaceId=${IDS.team}`,
				`/api/pages/${IDS.sharedA}`,
			];
			for (const path of paths) {
				const answer = await send(base, path, asB);
				assert.equal(answer.status, 200, `${path}: ${answer.text}`);
				assert.equal(parentReads(mock), 0, `${path} must not read the parent map`);
			}
		});
	});

	it('the unfiltered list is exactly develop\'s readablePageRows answer', async () => {
		const world = teamWorld();
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, asB);
			assert.equal(answer.status, 200, answer.text);
			const expected = readablePageRows(world.osionos_pages, IDS.userB).map((row) => row.id).sort();
			assert.deepEqual(answer.body.map((entry) => entry._id).sort(), expected);
		});
	});
});

describe('a ruled workspace still loads the parent map once per request', () => {
	it('one parent read for a list, one for a graph, one for a page read', async () => {
		const mock = createPostgrestMock(ruledWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const path of [
				`/api/pages?workspaceId=${IDS.team}`,
				`/api/graph/pages?workspaceId=${IDS.team}`,
				`/api/pages/${CHILD}`,
			]) {
				const before = parentReads(mock);
				const answer = await send(base, path, asB);
				assert.equal(answer.status, 200, `${path}: ${answer.text}`);
				assert.equal(parentReads(mock) - before, 1, `${path}: exactly one parent map read`);
			}
		});
	});
});

describe('the parent map carries page metadata only when a grant can use it (X1)', () => {
	async function selectsFor(permission) {
		const mock = createPostgrestMock(ruledWorld(permission));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/pages?workspaceId=${IDS.team}`, asB);
			assert.equal(answer.status, 200, answer.text);
		});
		return parentSelects(mock);
	}

	it('a grant workspace reads owner_id and visibility', async () => {
		assert.deepEqual(await selectsFor('can_view'), [PARENT_META_SELECT]);
	});

	it('a deny-only workspace keeps the two-column read', async () => {
		assert.deepEqual(await selectsFor('no_access'), [PARENT_SELECT]);
	});
});
