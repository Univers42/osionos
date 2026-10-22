/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-share-rules-enforcement.test.mjs            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The share rules, enforced: the rule the Share dialog stored decides whether the caller
 * may read one page and whether they may write it.
 *
 *   can_view  → the page opens for the caller
 *   can_edit  → the caller writes the page (and only its content: the sharing keys stay
 *               the owner's — withoutForeignSharingChanges drops them)
 *   no_access → the page is a missing id (404), never a 403 that would confirm it
 *
 * The harness's default workspace RPC makes every member an owner, so a rule could never
 * be reached: the world below is built with `realWorkspaceRpc: true`, which answers the
 * RPC from the seeded osionos_workspace_members rows — the role the bridge sees IS the
 * seeded one.
 *
 * The rules never reach a non-member (the workspace gate answers first) and never touch
 * the page owner or the workspace owner/admin (their access is whatever it was).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgrestMock, harnessConfig, patch, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const ALL = ['create', 'read', 'update', 'delete', 'admin'];
const EDITOR_PERMISSIONS = ['create', 'read', 'update', 'delete'];
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const CALLER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
const PAGE_OWNER = 'dddddddd-4444-4444-8444-dddddddddddd';
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const HOME = 'f0000000-1111-4111-8111-f00000000f00';
const WS = 'a1000000-1111-4111-8111-a10000000f01';
const ELSEWHERE = 'b2000000-1111-4111-8111-b20000000f02';
const PAGE = 'c3000000-1111-4111-8111-c30000000f03';
const PUBLIC_PAGE = 'd4000000-1111-4111-8111-d40000000f04';
const SHARED_PAGE = 'e5000000-1111-4111-8111-e50000000f05';
const OWNED_PAGE = 'f6000000-1111-4111-8111-f60000000f06';
const CALLER_PAGE = 'a8000000-1111-4111-8111-a80000000f08';
const RULE_ID = 'b9000000-1111-4111-8111-b90000000f09';

/** The caller's membership: a viewer by default (read only), an editor when a case needs one. */
const VIEWER = { role: 'viewer', permissions: ['read'] };
const EDITOR = { role: 'editor', permissions: EDITOR_PERMISSIONS };

/** A stored share rule (public.osionos_share_rules). */
function rule(over = {}) {
	return {
		id: RULE_ID,
		workspace_id: WS,
		resource_type: 'page',
		resource_id: PAGE,
		target: { type: 'user', userId: CALLER },
		permission: 'can_view',
		explicit: true,
		...over,
	};
}

/** The pages of the world: a private one, a public one, a shared one, and two owned pages. */
function pages() {
	const base = {
		title: 'A private plan', collaborators: [], properties: [],
		content: [{ id: 'b1', type: 'paragraph', content: 'secret' }],
		parent_page_id: null, archived_at: null,
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
	return [
		{ ...base, id: PAGE, workspace_id: WS, owner_id: OWNER, visibility: 'private' },
		{ ...base, id: PUBLIC_PAGE, workspace_id: WS, owner_id: OWNER, visibility: 'public', title: 'A public note' },
		{ ...base, id: SHARED_PAGE, workspace_id: WS, owner_id: OWNER, visibility: 'shared', title: 'Team notes' },
		{ ...base, id: OWNED_PAGE, workspace_id: WS, owner_id: PAGE_OWNER, visibility: 'private', title: 'Owned by an editor' },
		{ ...base, id: CALLER_PAGE, workspace_id: WS, owner_id: CALLER, visibility: 'private', title: 'The caller\'s own page' },
	];
}

/** The members of the world: the caller (a viewer), the owner, an admin, an editor page owner. */
function members(caller = VIEWER) {
	return [
		{ workspace_id: HOME, user_id: CALLER, role: 'owner', permissions: ALL },
		{ workspace_id: WS, user_id: CALLER, ...caller },
		{ workspace_id: WS, user_id: OWNER, role: 'owner', permissions: ALL },
		{ workspace_id: WS, user_id: ADMIN, role: 'admin', permissions: ALL },
		{ workspace_id: WS, user_id: PAGE_OWNER, role: 'editor', permissions: EDITOR_PERMISSIONS },
	];
}

/**
 * One request against a bridge over the seeded world. `as` picks the caller, `rules` the
 * stored share rules, `caller` the caller's membership, `pageRows` the pages.
 */
async function ask(route, { as = CALLER, rules = [], caller = VIEWER, pageRows = pages(), workspaces = [WS] } = {}) {
	const mock = createPostgrestMock({
		osionos_workspace_members: members(caller),
		osionos_pages: pageRows,
		osionos_share_rules: rules,
	}, { realWorkspaceRpc: true });
	const headers = sessionHeaders(config, as, HOME, workspaces);
	const answer = await withBridge(config, mock.fetchImpl, (base) => route(base, headers));
	return { ...answer, rows: mock.rows('osionos_pages'), ruleRows: mock.rows('osionos_share_rules') };
}

const read = (base, headers, id = PAGE) => send(base, `/api/pages/${id}`, headers);
const write = (base, headers, body = { title: 'changed' }) => send(base, `/api/pages/${PAGE}`, headers, patch(body));
const post = (base, headers, path, body) => send(base, path, headers, { method: 'POST', body: JSON.stringify(body) });

describe('a share rule decides the single-page read', () => {
	it('without a rule the page stays a missing id for the caller', async () => {
		const { status, body } = await ask(read);
		assert.equal(status, 404, body && JSON.stringify(body));
	});

	it('a can_view rule makes the page readable', async () => {
		const { status, body } = await ask(read, { rules: [rule({ permission: 'can_view' })] });
		assert.equal(status, 200, body && JSON.stringify(body));
		assert.equal(body._id, PAGE);
	});

	it('a can_comment rule reads, and never writes', async () => {
		const { status } = await ask(read, { rules: [rule({ permission: 'can_comment' })] });
		assert.equal(status, 200);
		const { status: written } = await ask(write, { rules: [rule({ permission: 'can_comment' })] });
		assert.equal(written, 403);
	});

	it('a no_access rule hides even a public page, and hides it as a missing id', async () => {
		const { status, body } = await ask((base, headers) => read(base, headers, PUBLIC_PAGE), {
			rules: [rule({ resource_id: PUBLIC_PAGE, permission: 'no_access' })],
		});
		assert.equal(status, 404, body && JSON.stringify(body));
		assert.equal(body.message, 'Page not found.');
	});

	it('a rule for another user leaves the caller as they were', async () => {
		const { status } = await ask(read, { rules: [rule({ target: { type: 'user', userId: STRANGER }, permission: 'can_view' })] });
		assert.equal(status, 404);
	});

	it('a rule in another workspace leaves the caller as they were', async () => {
		const { status } = await ask(read, { rules: [rule({ workspace_id: ELSEWHERE, permission: 'can_view' })] });
		assert.equal(status, 404);
	});

	it('a rule does not let a non-member into the page workspace', async () => {
		const { status } = await ask(read, {
			as: STRANGER,
			workspaces: [ELSEWHERE],
			rules: [rule({ target: { type: 'user', userId: STRANGER }, permission: 'can_view' })],
		});
		assert.equal(status, 404);
	});
});

describe('a share rule decides the single-page write', () => {
	it('a can_view rule reads the page and still refuses the write', async () => {
		const { status, body } = await ask(write, { rules: [rule({ permission: 'can_view' })] });
		assert.equal(status, 403, body && JSON.stringify(body));
	});

	it('a can_edit rule grants the write, and the sharing keys stay the owner\'s', async () => {
		const { status, body, rows } = await ask((base, headers) => write(base, headers, { title: 'changed', visibility: 'public' }), {
			rules: [rule({ permission: 'can_edit' })],
		});
		assert.equal(status, 200, body && JSON.stringify(body));
		assert.deepEqual(body.ignored, ['visibility']);
		assert.equal(rows.find((row) => row.id === PAGE).visibility, 'private');
	});

	it('a no_access rule beats the base grant', async () => {
		// The page is shared, so the base rule lets the editor read it: the deny is then the
		// only thing that refuses, and it refuses the write with a 403.
		const world = { rules: [rule({ resource_id: SHARED_PAGE, permission: 'no_access' })], caller: EDITOR };
		const { status: readStatus } = await ask((base, headers) => read(base, headers, SHARED_PAGE), world);
		assert.equal(readStatus, 404);
		const { status, body } = await ask((base, headers) => send(base, `/api/pages/${SHARED_PAGE}`, headers, patch({ title: 'changed' })), world);
		assert.equal(status, 403, body && JSON.stringify(body));
	});

	it('the caller who is an editor collaborator is refused by a no_access rule too', async () => {
		const pageRows = pages().map((row) => (row.id === PAGE ? { ...row, collaborators: [{ userId: CALLER, role: 'editor' }] } : row));
		const { status: readStatus } = await ask(read, { rules: [rule({ permission: 'no_access' })], caller: EDITOR, pageRows });
		assert.equal(readStatus, 404);
		const { status, body } = await ask(write, { rules: [rule({ permission: 'no_access' })], caller: EDITOR, pageRows });
		assert.equal(status, 403, body && JSON.stringify(body));
	});

	it('without a rule the write of an unreadable page is a missing id, and the row is untouched', async () => {
		// A page the caller may not read is a missing id (C134-C136): the read answer comes
		// before the write answer, so the write never confirms that the page exists.
		const { status, body, rows } = await ask(write);
		assert.equal(status, 404, body && JSON.stringify(body));
		assert.equal(rows.find((row) => row.id === PAGE).title, 'A private plan');
	});

	it('the write of a page the caller may read is refused with 403', async () => {
		const { status, body } = await ask((base, headers) => send(base, `/api/pages/${SHARED_PAGE}`, headers, patch({ title: 'changed' })));
		assert.equal(status, 403, body && JSON.stringify(body));
	});
});

describe('the owner and the workspace owner/admin keep their access', () => {
	it('a no_access rule naming the page owner has no effect on them', async () => {
		const { status } = await ask(read, { as: OWNER, rules: [rule({ target: { type: 'user', userId: OWNER }, permission: 'no_access' })] });
		assert.equal(status, 200);
	});

	it('a no_access rule naming the workspace admin has no effect on them', async () => {
		const answer = await ask((base, headers) => read(base, headers, SHARED_PAGE), {
			as: ADMIN,
			rules: [rule({ resource_id: SHARED_PAGE, target: { type: 'user', userId: ADMIN }, permission: 'no_access' })],
		});
		assert.equal(answer.status, 200);
	});

	it('a no_access rule naming the page owner has no effect on their write', async () => {
		const { status, body } = await ask((base, headers) => send(base, `/api/pages/${PAGE}`, headers, patch({ title: 'changed' })), {
			as: OWNER,
			rules: [rule({ target: { type: 'user', userId: OWNER }, permission: 'no_access' })],
		});
		assert.equal(status, 200, body && JSON.stringify(body));
	});
});

describe('the rule routes are owner-scoped', () => {
	const ruleBody = { workspaceId: WS, resourceType: 'page', resourceId: PAGE, permission: 'can_view', target: { type: 'user', userId: CALLER } };

	it('a member with update who does not own the page cannot write a rule for it', async () => {
		const { status, body, ruleRows } = await ask(
			(base, headers) => post(base, headers, '/api/perms/rules', ruleBody),
			{ caller: EDITOR },
		);
		assert.equal(status, 403, body && JSON.stringify(body));
		assert.deepEqual(ruleRows, []);
	});

	it('the owner of a page may write a rule for it', async () => {
		const { status, body, ruleRows } = await ask(
			(base, headers) => post(base, headers, '/api/perms/rules', { ...ruleBody, resourceId: OWNED_PAGE }),
			{ as: PAGE_OWNER },
		);
		assert.equal(status, 200, body && JSON.stringify(body));
		assert.equal(ruleRows.length, 1);
	});

	it('the page owner, a workspace viewer, can delete a rule about their page', async () => {
		const { status, body, ruleRows } = await ask(
			(base, headers) => send(base, `/api/perms/rules/${RULE_ID}`, headers, { method: 'DELETE' }),
			{ rules: [rule({ resource_id: CALLER_PAGE })] },
		);
		assert.equal(status, 200, body && JSON.stringify(body));
		assert.deepEqual(ruleRows, []);
	});
});
