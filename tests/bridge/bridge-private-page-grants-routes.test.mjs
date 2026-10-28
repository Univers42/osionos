/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-private-page-grants-routes.test.mjs         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// X1-C1/C2 through the real routes: a rule the private page's owner does not control
// (workspace-wide, or on the owner's SHARED parent) never opens the page and never
// raises a collaborator's write — it can only lower it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const CHILD = 'a5a5a5a5-1111-4111-8111-a5a5a5a5a5a5';

function wideRule(permission) {
	return { id: 'rule-wide', workspace_id: IDS.team, resource_type: 'page', resource_id: '', target: { type: 'workspace' }, permission, explicit: true };
}

/** B (memberRole) in A's team; A's private page, optionally with B as collaborator. */
function world({ memberRole, collaborator, rules }) {
	const seed = teamWorld({ memberRole });
	const page = seed.osionos_pages.find((row) => row.id === IDS.privateA);
	if (collaborator) page.collaborators = [{ userId: IDS.userB, role: 'editor' }];
	seed.osionos_share_rules = rules;
	return seed;
}

async function asB(seed, fn) {
	const mock = createPostgrestMock(seed);
	return withBridge(config, mock.fetchImpl, (base) => fn(base, sessionHeaders(config, IDS.userB, IDS.homeB)));
}

describe('X1-C2: a workspace-wide rule only lowers access on a private page', () => {
	it('baseline: a collaborator editor with no rule may PATCH', async () => {
		await asB(world({ memberRole: 'editor', collaborator: true, rules: [] }), async (base, headers) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, headers, patch({ title: 'Edited' }));
			assert.equal(result.status, 200, result.text);
		});
	});

	it('a collaborator editor under a wide can_view gets 403 (C558 kept)', async () => {
		await asB(world({ memberRole: 'editor', collaborator: true, rules: [wideRule('can_view')] }), async (base, headers) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, headers, patch({ title: 'Edited' }));
			assert.equal(result.status, 403, result.text);
		});
	});

	it('a collaborator viewer under a wide can_edit gets 403', async () => {
		await asB(world({ memberRole: 'viewer', collaborator: true, rules: [wideRule('can_edit')] }), async (base, headers) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, headers, patch({ title: 'Edited' }));
			assert.equal(result.status, 403, result.text);
		});
	});

	it('a non-collaborator under a wide can_edit can neither read nor PATCH it', async () => {
		await asB(world({ memberRole: 'editor', collaborator: false, rules: [wideRule('can_edit')] }), async (base, headers) => {
			const read = await send(base, `/api/pages/${IDS.privateA}`, headers);
			assert.equal(read.status, 404, read.text);
			const write = await send(base, `/api/pages/${IDS.privateA}`, headers, patch({ title: 'Edited' }));
			assert.equal(write.status, 404, write.text);
		});
	});

	it('the same wide can_edit still opens a shared page (no regression)', async () => {
		await asB(world({ memberRole: 'viewer', collaborator: false, rules: [wideRule('can_edit')] }), async (base, headers) => {
			const result = await send(base, `/api/pages/${IDS.sharedA}`, headers, patch({ title: 'Edited' }));
			assert.equal(result.status, 200, result.text);
		});
	});
});

describe('X1-C1: a grant on the owner\'s SHARED parent does not reach a private child', () => {
	function parentWorld() {
		const seed = teamWorld({ memberRole: 'viewer' });
		seed.osionos_pages.push({ ...teamPage(CHILD, IDS.userA, 'private', 'A private child', 'child text'), parent_page_id: IDS.sharedA });
		seed.osionos_share_rules = [{ id: 'rule-parent', workspace_id: IDS.team, resource_type: 'page', resource_id: IDS.sharedA, target: { type: 'workspace' }, permission: 'can_view', explicit: true }];
		return seed;
	}

	it('the parent stays readable and the private child answers 404', async () => {
		await asB(parentWorld(), async (base, headers) => {
			const parent = await send(base, `/api/pages/${IDS.sharedA}`, headers);
			assert.equal(parent.status, 200, parent.text);
			const child = await send(base, `/api/pages/${CHILD}`, headers);
			assert.equal(child.status, 404, child.text);
		});
	});
});
