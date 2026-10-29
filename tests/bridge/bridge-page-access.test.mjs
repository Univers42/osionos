/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The ONE page-access decision (C510): the caller matrix across a three-level tree,
 * the deny-wins/nearest-grant rules, the broken-chain refusals, and a seeded property
 * run over random trees with cycles and orphans.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ANCESTOR_DEPTH, pageAccessLevel, pageRuleLevel } from '../../scripts/bridge-page-access.mjs';
import { MARKETPLACE_WORKSPACE_ID } from '../../scripts/bridge-page-read.mjs';

const WS = '11111111-1111-4111-8111-111111111111';
const ROOT = 'aaaaaaaa-0000-4000-8000-000000000001';
const CHILD = 'aaaaaaaa-0000-4000-8000-000000000002';
const GRAND = 'aaaaaaaa-0000-4000-8000-000000000003';
const PAGE_OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const WS_OWNER = 'bbbbbbbb-0000-4000-8000-000000000002';
const WS_ADMIN = 'bbbbbbbb-0000-4000-8000-000000000003';
const EDITOR = 'bbbbbbbb-0000-4000-8000-000000000004';
const VIEWER = 'bbbbbbbb-0000-4000-8000-000000000005';
const GUEST = 'bbbbbbbb-0000-4000-8000-000000000006';
const OUTSIDER = 'bbbbbbbb-0000-4000-8000-000000000007';

const PAGES = {
	root: { id: ROOT, workspace_id: WS, owner_id: PAGE_OWNER, visibility: 'private', collaborators: [] },
	child: { id: CHILD, workspace_id: WS, owner_id: PAGE_OWNER, visibility: 'private', collaborators: [] },
	grand: { id: GRAND, workspace_id: WS, owner_id: PAGE_OWNER, visibility: 'private', collaborators: [] },
};

const PARENT_OF = new Map([[ROOT, null], [CHILD, ROOT], [GRAND, CHILD]]);

/** What the loader reads beside parentOf: each page's owner and visibility (X1). */
function metaOf(pages) {
	return new Map(Object.values(pages).map((page) => [page.id, { owner_id: page.owner_id, visibility: page.visibility }]));
}
const PAGE_META = metaOf(PAGES);

const CALLERS = {
	pageOwner: { userId: PAGE_OWNER, member: { role: 'editor' } },
	wsOwner: { userId: WS_OWNER, member: { role: 'owner' } },
	wsAdmin: { userId: WS_ADMIN, member: { role: 'admin' } },
	editor: { userId: EDITOR, member: { role: 'editor' } },
	viewer: { userId: VIEWER, member: { role: 'viewer' } },
	guest: { userId: GUEST, member: { role: 'guest' } },
	outsider: { userId: OUTSIDER, member: null },
};

function rule(resourceId, permission, target = { type: 'user', userId: GUEST }) {
	return { workspace_id: WS, resource_type: 'page', resource_id: resourceId, target, permission, explicit: true };
}

function rules(pairs = []) {
	const map = new Map();
	for (const [pageId, list] of pairs) map.set(pageId.toLowerCase(), list);
	return map;
}

/** A workspace that HAS a rule, so the parent chain is walked — the rule itself is outside the tested chains. */
const RULED_ELSEWHERE = rules([[GRAND, [rule(GRAND, 'can_view')]]]);

function level(callerKey, pageKey, rulesByPage = new Map(), parentOf = PARENT_OF, rowOverride = null, pageMeta = PAGE_META) {
	const caller = CALLERS[callerKey];
	return pageAccessLevel({
		row: rowOverride ?? PAGES[pageKey],
		userId: caller.userId,
		member: caller.member,
		rulesByPage,
		parentOf,
		teamIds: [],
		pageMeta,
	});
}

const all = (value) => ({ root: value, child: value, grand: value });
const ALL_FULL = all('full_access');
const ALL_NONE = all('none');

function assertMatrix(scenario) {
	for (const [callerKey, expected] of Object.entries(scenario.expected)) {
		for (const pageKey of ['root', 'child', 'grand']) {
			assert.equal(
				level(callerKey, pageKey, scenario.rules ?? new Map()),
				expected[pageKey],
				`${scenario.name}: ${callerKey} on ${pageKey}`,
			);
		}
	}
}

describe('the page-access matrix (private tree)', () => {
	it('no rules: the page owner reads; private pages stay hidden from everyone else, admins included', () => {
		assertMatrix({
			name: 'no rules',
			expected: {
				pageOwner: ALL_FULL, wsOwner: ALL_NONE, wsAdmin: ALL_NONE,
				editor: ALL_NONE, viewer: ALL_NONE, guest: ALL_NONE, outsider: ALL_NONE,
			},
		});
	});

	it('a workspace admin still reads a SHARED page that a deny rule would take away', () => {
		const shared = { ...PAGES.child, visibility: 'shared' };
		const deniesAdmin = rules([[ROOT, [rule(ROOT, 'no_access', { type: 'role', role: 'admin' })]]]);
		assert.equal(level('wsAdmin', 'child', deniesAdmin, PARENT_OF, shared), 'full_access');
		assert.equal(level('wsOwner', 'child', deniesAdmin, PARENT_OF, shared), 'full_access');
	});

	it('no_access for the guest on the ROOT denies the whole subtree', () => {
		assertMatrix({
			name: 'user deny on root',
			rules: rules([[ROOT, [rule(ROOT, 'no_access')]]]),
			expected: {
				pageOwner: ALL_FULL, wsOwner: ALL_NONE, wsAdmin: ALL_NONE,
				editor: ALL_NONE, viewer: ALL_NONE, guest: ALL_NONE, outsider: ALL_NONE,
			},
		});
	});

	it('no_access for the viewer ROLE on the ROOT denies the viewer\'s whole subtree', () => {
		assertMatrix({
			name: 'role deny on root',
			rules: rules([[ROOT, [rule(ROOT, 'no_access', { type: 'role', role: 'viewer' })]]]),
			expected: {
				pageOwner: ALL_FULL, wsOwner: ALL_NONE, wsAdmin: ALL_NONE,
				editor: ALL_NONE, viewer: ALL_NONE, guest: ALL_NONE, outsider: ALL_NONE,
			},
		});
	});

	it('a named can_view on the CHILD reaches the child and its grandchild, never the root', () => {
		assertMatrix({
			name: 'named grant on child',
			rules: rules([[CHILD, [rule(CHILD, 'can_view')]]]),
			expected: {
				pageOwner: ALL_FULL, wsOwner: ALL_NONE, wsAdmin: ALL_NONE,
				editor: ALL_NONE, viewer: ALL_NONE,
				guest: { root: 'none', child: 'can_view', grand: 'can_view' },
				outsider: ALL_NONE,
			},
		});
	});

	it('can_edit on the ROOT and no_access on the CHILD: deny on the ancestor wins below it', () => {
		assertMatrix({
			name: 'grant root, deny child',
			rules: rules([[ROOT, [rule(ROOT, 'can_edit')]], [CHILD, [rule(CHILD, 'no_access')]]]),
			expected: {
				pageOwner: ALL_FULL, wsOwner: ALL_NONE, wsAdmin: ALL_NONE,
				editor: ALL_NONE, viewer: ALL_NONE,
				guest: { root: 'can_edit', child: 'none', grand: 'none' },
				outsider: ALL_NONE,
			},
		});
	});
});

describe('the resolution order outside the matrix', () => {
	it('falls back to the visibility default when no page in the chain has a matching rule', () => {
		const shared = { ...PAGES.child, visibility: 'shared' };
		assert.equal(level('viewer', 'child', new Map(), PARENT_OF, shared), 'can_view');
		assert.equal(level('outsider', 'child', new Map(), PARENT_OF, shared), 'none');
	});

	it('reads a workspace-wide rule (resource_id \'\') on every shared page, never on a private one (X1)', () => {
		const wide = rules([['', [rule('', 'can_view', { type: 'user', userId: VIEWER })]]]);
		for (const page of ['root', 'child', 'grand']) {
			const shared = { ...PAGES[page], visibility: 'shared' };
			assert.equal(level('viewer', page, wide, PARENT_OF, shared), 'can_view', `workspace-wide rule applies to shared ${page}`);
			assert.equal(level('viewer', page, wide), 'none', `workspace-wide rule skips private ${page}`);
		}
	});

	it('the nearest matching page wins, a farther grant never overrides it', () => {
		const rulesByPage = rules([
			[ROOT, [rule(ROOT, 'full_access')]],
			[CHILD, [rule(CHILD, 'can_comment')]],
		]);
		assert.equal(level('guest', 'grand', rulesByPage), 'can_comment');
	});

	it('a deny on the page itself beats a grant on a nearer page', () => {
		const rulesByPage = rules([
			[GRAND, [rule(GRAND, 'can_edit')]],
			[ROOT, [rule(ROOT, 'no_access')]],
		]);
		assert.equal(level('guest', 'grand', rulesByPage), 'none');
	});

	it('a malformed rule neither grants nor denies', () => {
		const malformed = rules([[ROOT, [rule(ROOT, 'unknown_permission')]]]);
		assert.equal(level('guest', 'grand', malformed), 'none');
		assert.equal(level('viewer', 'child', malformed), 'none');
	});

	it('an empty rulesByPage skips the ancestor walk: an unknown parent id is the visibility default', () => {
		const unknownParent = new Map([[CHILD, 'ffffffff-0000-4000-8000-000000000000']]);
		const shared = { ...PAGES.child, visibility: 'shared' };
		// parentOf null (the loader skips the map) or a map that cannot prove the chain:
		// with no rule at all, neither can deny. The visibility rule decides, as before.
		for (const parentOf of [null, new Map(), unknownParent]) {
			assert.equal(level('viewer', 'child', new Map(), parentOf, shared), 'can_view');
			assert.equal(level('viewer', 'child', new Map(), parentOf, PAGES.child), 'none');
			assert.equal(level('wsOwner', 'child', new Map(), parentOf, shared), 'full_access');
			assert.equal(level('wsOwner', 'child', new Map(), parentOf, PAGES.child), 'none');
		}
	});

	it('C557: an owner without membership keeps their page only in the memberless marketplace', () => {
		const left = { userId: PAGE_OWNER, member: null };
		const decide = (row) => pageAccessLevel({ row, userId: left.userId, member: left.member, teamIds: [] });
		assert.equal(decide(PAGES.root), 'none');
		assert.equal(decide({ ...PAGES.root, workspace_id: MARKETPLACE_WORKSPACE_ID }), 'full_access');
		assert.equal(pageAccessLevel({ row: { ...PAGES.root, workspace_id: MARKETPLACE_WORKSPACE_ID }, userId: OUTSIDER, member: null, teamIds: [] }), 'none');
	});
});

describe('X1: a private page takes a grant only from its owner', () => {
	const toGuest = (permission) => rule(ROOT, permission);
	/** ROOT held by another member: the R3/R4 shape (a grant on someone else's ancestor). */
	const foreignRoot = new Map(PAGE_META).set(ROOT, { owner_id: EDITOR, visibility: 'private' });
	const sharedRoot = new Map(PAGE_META).set(ROOT, { owner_id: PAGE_OWNER, visibility: 'shared' });
	const asCollaborator = (page, role = 'editor') => ({ ...PAGES[page], collaborators: [{ userId: GUEST, role }] });

	it('R1: a workspace-wide grant never opens a private page, and still opens a shared one', () => {
		const wide = rules([['', [rule('', 'full_access')]]]);
		assert.equal(level('guest', 'child', wide), 'none');
		assert.equal(level('guest', 'child', wide, PARENT_OF, { ...PAGES.child, visibility: 'shared' }), 'full_access');
	});

	it('R2: a rule on the private page itself still grants (the owner wrote it, or it predates X1)', () => {
		assert.equal(level('guest', 'child', rules([[CHILD, [rule(CHILD, 'can_edit')]]])), 'can_edit');
	});

	it('R3/R4: a grant on an ancestor another member holds never reaches the private page', () => {
		const onRoot = rules([[ROOT, [toGuest('can_edit')]]]);
		assert.equal(level('guest', 'child', onRoot, PARENT_OF, null, foreignRoot), 'none');
		assert.equal(level('guest', 'grand', onRoot, PARENT_OF, null, foreignRoot), 'none');
		assert.equal(level('guest', 'child', onRoot, PARENT_OF, { ...PAGES.child, visibility: 'shared' }, foreignRoot), 'can_edit');
	});

	it('a grant on the owner\'s own SHARED ancestor does not reach a private child', () => {
		assert.equal(level('guest', 'child', rules([[ROOT, [toGuest('can_view')]]]), PARENT_OF, null, sharedRoot), 'none');
	});

	it('the owner\'s own private ancestor grant inherits down the whole run', () => {
		const onRoot = rules([[ROOT, [toGuest('can_comment')]]]);
		assert.equal(level('guest', 'child', onRoot), 'can_comment');
		assert.equal(level('guest', 'grand', onRoot), 'can_comment');
	});

	it('a foreign ancestor ends the run: the owner\'s grant above it does not cross', () => {
		const foreignChild = new Map(PAGE_META).set(CHILD, { owner_id: EDITOR, visibility: 'private' });
		assert.equal(level('guest', 'grand', rules([[ROOT, [toGuest('can_view')]]]), PARENT_OF, null, foreignChild), 'none');
	});

	it('a deny on a foreign ancestor still denies the owner\'s own grant (fail closed)', () => {
		const rulesByPage = rules([[CHILD, [rule(CHILD, 'can_edit')]], [ROOT, [toGuest('no_access')]]]);
		assert.equal(level('guest', 'child', rulesByPage, PARENT_OF, null, foreignRoot), 'none');
	});

	it('a nearer foreign grant below the owner\'s grant still caps it, never raises it', () => {
		const rulesByPage = rules([[ROOT, [toGuest('can_edit')]], ['', [rule('', 'can_view')]]]);
		assert.equal(level('guest', 'grand', rulesByPage), 'can_view');
	});

	it('a collaborator keeps the visibility default; a wide can_view caps them, a wide can_edit does not raise them', () => {
		assert.equal(level('guest', 'child', RULED_ELSEWHERE, PARENT_OF, asCollaborator('child')), 'can_view');
		assert.equal(level('guest', 'child', rules([['', [rule('', 'can_comment')]]]), PARENT_OF, asCollaborator('child')), 'can_comment');
		assert.equal(pageRuleLevel({ row: asCollaborator('child'), userId: GUEST, member: CALLERS.guest.member, rulesByPage: rules([['', [rule('', 'can_view')]]]), parentOf: PARENT_OF, teamIds: [], pageMeta: PAGE_META }), 'can_view');
		const wideEdit = rules([['', [rule('', 'full_access')]]]);
		assert.equal(level('guest', 'child', wideEdit, PARENT_OF, asCollaborator('child')), 'can_view');
		assert.equal(pageRuleLevel({ row: asCollaborator('child'), userId: GUEST, member: CALLERS.guest.member, rulesByPage: wideEdit, parentOf: PARENT_OF, teamIds: [], pageMeta: PAGE_META }), null);
	});

	it('missing or partial pageMeta: an ancestor grant is ignored, the page\'s own rule still counts', () => {
		const onRoot = rules([[ROOT, [toGuest('can_edit')]]]);
		for (const pageMeta of [null, new Map(), new Map([[CHILD, PAGE_META.get(CHILD)]])]) {
			assert.equal(level('guest', 'grand', onRoot, PARENT_OF, null, pageMeta), 'none');
		}
		assert.equal(level('guest', 'grand', rules([[GRAND, [rule(GRAND, 'can_view')]]]), PARENT_OF, null, null), 'can_view');
	});

	it('the owner and their rules: the owner keeps full access whatever a foreign rule says', () => {
		const denyOwner = rules([['', [rule('', 'no_access', { type: 'user', userId: PAGE_OWNER })]]]);
		assert.equal(level('pageOwner', 'grand', denyOwner), 'full_access');
	});
});

describe('a broken parent chain is fail-closed', () => {
	it('a cycle answers none', () => {
		const parentOf = new Map([[ROOT, CHILD], [CHILD, ROOT]]);
		assert.equal(level('viewer', 'root', RULED_ELSEWHERE, parentOf, { ...PAGES.root, visibility: 'shared' }), 'none');
	});

	it('an orphan parent id missing from the map answers none', () => {
		const parentOf = new Map([[CHILD, 'ffffffff-0000-4000-8000-000000000000']]);
		assert.equal(level('viewer', 'child', RULED_ELSEWHERE, parentOf, { ...PAGES.child, visibility: 'shared' }), 'none');
	});

	it('a chain deeper than the cap answers none, the cap itself is allowed', () => {
		const ids = Array.from({ length: MAX_ANCESTOR_DEPTH + 1 }, (_, index) => `cccccccc-0000-4000-8000-${String(index).padStart(12, '0')}`);
		const parentOf = new Map(ids.map((id, index) => [id, index === 0 ? null : ids[index - 1]]));
		const shared = (id) => ({ id, workspace_id: WS, owner_id: PAGE_OWNER, visibility: 'shared', collaborators: [] });
		assert.equal(level('viewer', 'root', RULED_ELSEWHERE, parentOf, shared(ids[MAX_ANCESTOR_DEPTH - 1])), 'can_view');
		assert.equal(level('viewer', 'root', RULED_ELSEWHERE, parentOf, shared(ids[MAX_ANCESTOR_DEPTH])), 'none');
	});

	it('the chain is read live: moving the page out of a denied subtree becomes readable at once', () => {
		const rulesByPage = rules([[ROOT, [rule(ROOT, 'no_access')]]]);
		const shared = { ...PAGES.grand, visibility: 'shared' };
		assert.equal(level('guest', 'grand', rulesByPage, PARENT_OF, shared), 'none');
		const detached = new Map(PARENT_OF);
		detached.set(GRAND, null);
		assert.equal(level('guest', 'grand', rulesByPage, detached, shared), 'can_view');
	});
});

/** A seeded PRNG (mulberry32) so the 500-tree run is reproducible. */
function mulberry32(seed) {
	return function next() {
		seed |= 0;
		seed = (seed + 0x6D2B79F5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function ancestorsOf(id, parentOf) {
	const out = [];
	const seen = new Set();
	let current = id;
	while (current && !seen.has(current) && parentOf.has(current)) {
		out.push(current);
		seen.add(current);
		current = parentOf.get(current);
	}
	return out;
}

describe('property: random trees never throw and never grant under a denying ancestor', () => {
	it('500 random trees, cycles and orphans', () => {
		const random = mulberry32(0x5eed2026);
		for (let iteration = 0; iteration < 500; iteration += 1) {
			const size = 3 + Math.floor(random() * 10);
			const ids = Array.from({ length: size }, (_, index) => `dddddddd-0000-4000-8000-${String(iteration).padStart(6, '0')}${String(index).padStart(6, '0')}`);
			const mode = random();
			const parentOf = new Map();
			let start = ids[size - 1];
			let broken = false;

			if (mode < 0.14) {
				// A 2-cycle somewhere in the middle; start on it.
				const at = Math.floor(random() * (size - 1));
				parentOf.set(ids[at], ids[at + 1]);
				parentOf.set(ids[at + 1], ids[at]);
				for (let index = 0; index < size; index += 1) if (!parentOf.has(ids[index])) parentOf.set(ids[index], index === 0 ? null : ids[index - 1]);
				start = ids[at];
				broken = true;
			} else if (mode < 0.28) {
				// An orphan: one node points at an id the map does not hold; start there.
				const at = 1 + Math.floor(random() * (size - 1));
				for (let index = 0; index < size; index += 1) parentOf.set(ids[index], index === 0 ? null : ids[index - 1]);
				parentOf.set(ids[at], `eeeeeeee-0000-4000-8000-${String(iteration).padStart(12, '0')}`);
				start = ids[at];
				broken = true;
			} else {
				for (let index = 0; index < size; index += 1) {
					parentOf.set(ids[index], index === 0 || random() < 0.15 ? null : ids[Math.floor(random() * index)]);
				}
			}

			const row = { id: start, workspace_id: WS, owner_id: PAGE_OWNER, visibility: 'shared', collaborators: [] };
			const target = { type: 'user', userId: VIEWER };
			const rulesByPage = new Map([[start, [rule(start, 'can_edit', target)]]]);
			const chain = broken ? null : ancestorsOf(start, parentOf);
			if (!broken) {
				const denyAt = chain[Math.floor(random() * chain.length)];
				rulesByPage.set(denyAt, [rule(denyAt, 'no_access', target)]);
			}

			let answer;
			assert.doesNotThrow(() => {
				answer = pageAccessLevel({ row, userId: VIEWER, member: { role: 'viewer' }, rulesByPage, parentOf, teamIds: [] });
			}, `iteration ${iteration} threw`);

			if (broken) assert.equal(answer, 'none', `iteration ${iteration}: cycle/orphan must deny`);
			else assert.equal(answer, 'none', `iteration ${iteration}: a denying ancestor must win`);
		}
	});
});
