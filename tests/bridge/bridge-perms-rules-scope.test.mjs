/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-perms-rules-scope.test.mjs                  :+:      :+:    :+:   */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * G1b: GET /api/perms/rules answers only what the caller can see, and `&inherited=1`
 * says what a page inherits. One test per conditional in the devil verdict
 * (C600-C605, C607-C611, C613, C614); C606 is the lead's live bench
 * (scripts/share-rules-read-bench.mjs) and C612 is the front unit.
 *
 * The fakes are the X1 harness: an in-memory PostgREST that records every call, so a
 * test can prove both the answer and the reads it did (or refused) to make it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pageAccessLevel, ruleReachesPage } from '../../scripts/bridge-page-access.mjs';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const W = IDS.team;
const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
const HOME_C = 'c0c0c0c0-4444-4444-8444-c0c0c0c0c0c0';
const OTHER_WS = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const ALL = ['create', 'read', 'update', 'delete', 'admin'];

const asB = sessionHeaders(config, IDS.userB, IDS.homeB, [W]);
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [W]);
const asC = sessionHeaders(config, ADMIN, HOME_C, [W]);

const UNKNOWN = 'd1000000-0000-4000-8000-000000000001';
const FOREIGN = 'd1000000-0000-4000-8000-000000000002';
const DENIED = 'd1000000-0000-4000-8000-000000000003';
const DB_RULE = 'd1000000-0000-4000-8000-000000000004';
const ROOT_PRIVATE = 'd1000000-0000-4000-8000-000000000010';
const MID_SHARED = 'd1000000-0000-4000-8000-000000000011';
const LEAF_PRIVATE = 'd1000000-0000-4000-8000-000000000012';
const P2 = 'd1000000-0000-4000-8000-000000000020';
const P2_A1 = 'd1000000-0000-4000-8000-000000000021';
const P2_A2 = 'd1000000-0000-4000-8000-000000000022';
const DENY_PAGE = 'd1000000-0000-4000-8000-000000000030';
const DENY_PARENT = 'd1000000-0000-4000-8000-000000000031';

const rulesUrl = (resourceId, inherited = false) => `/api/perms/rules?workspaceId=${W}`
	+ (resourceId === undefined ? '' : `&resourceId=${encodeURIComponent(resourceId)}`)
	+ (inherited ? '&inherited=1' : '');

function rule(over = {}) {
	return {
		id: 'e1000000-0000-4000-8000-000000000001', workspace_id: W,
		resource_type: 'page', resource_id: IDS.sharedA,
		target: { type: 'user', userId: IDS.userB }, permission: 'can_view', explicit: true,
		...over,
	};
}

function world() {
	const base = teamWorld();
	base.osionos_workspace_members.push({ workspace_id: W, user_id: ADMIN, role: 'admin', permissions: ALL });
	base.osionos_pages.push(
		{ ...teamPage(FOREIGN, IDS.userA, 'shared', 'Foreign', 'foreign'), workspace_id: OTHER_WS },
		teamPage(DENIED, IDS.userA, 'shared', 'Denied', 'denied'),
		teamPage(ROOT_PRIVATE, IDS.userA, 'private', 'Root', 'root'),
		{ ...teamPage(MID_SHARED, IDS.userA, 'shared', 'Mid', 'mid'), parent_page_id: ROOT_PRIVATE },
		{ ...teamPage(LEAF_PRIVATE, IDS.userA, 'private', 'Leaf', 'leaf'), parent_page_id: MID_SHARED, collaborators: [{ userId: IDS.userB, role: 'viewer' }] },
		teamPage(P2, IDS.userA, 'shared', 'P2', 'p2'),
		{ ...teamPage(P2_A1, IDS.userA, 'shared', 'A1', 'a1'), parent_page_id: P2_A2 },
		teamPage(P2_A2, IDS.userA, 'shared', 'A2', 'a2'),
		teamPage(DENY_PAGE, IDS.userA, 'shared', 'Deny page', 'deny page'),
		{ ...teamPage(DENY_PARENT, IDS.userA, 'shared', 'Deny parent', 'deny parent') },
	);
	// P2's chain is P2 -> A1 -> A2.
	base.osionos_pages.find((page) => page.id === P2).parent_page_id = P2_A1;
	base.osionos_share_rules = [
		rule({ id: 'e1000000-0000-4000-8000-000000000101', resource_id: DENIED, permission: 'no_access' }),
		rule({ id: 'e1000000-0000-4000-8000-000000000102', resource_id: ROOT_PRIVATE, target: { type: 'user', userId: ADMIN }, permission: 'no_access' }),
		rule({ id: 'e1000000-0000-4000-8000-000000000103', resource_id: MID_SHARED, permission: 'can_edit' }),
		rule({ id: 'e1000000-0000-4000-8000-000000000104', resource_id: P2_A1 }),
		rule({ id: 'e1000000-0000-4000-8000-000000000105', resource_id: P2_A2 }),
	];
	return base;
}

async function withWorld(world, run, mockOptions = {}) {
	const mock = createPostgrestMock(world, { realWorkspaceRpc: true, ...mockOptions });
	return withBridge(config, mock.fetchImpl, (base) => run(base, mock));
}

describe('C600: a page the caller cannot see is the page route\'s 404, byte for byte', () => {
	it('unknown, foreign-workspace, private and rule-denied ids answer the same body as a missing page', async () => {
		await withWorld(world(), async (base) => {
			const cases = [UNKNOWN, FOREIGN, IDS.privateA, DENIED];
			const bodies = [];
			for (const id of cases) {
				const answer = await send(base, rulesUrl(id, true), asB);
				assert.equal(answer.status, 404, `${id}: ${answer.text}`);
				bodies.push(answer.text);
			}
			const pageMissing = await send(base, `/api/pages/${UNKNOWN}`, asB);
			assert.equal(pageMissing.status, 404, pageMissing.text);
			for (const body of bodies) assert.equal(body, pageMissing.text, 'the rules 404 is the page 404');
			assert.equal(new Set(bodies).size, 1, 'all four cases share one body');
		});
	});
});

describe('C601: an unknown id and an unreadable page make the same upstream calls', () => {
	it('loads the workspace access entry and the page row for both, member and admin', async () => {
		await withWorld(world(), async (base, mock) => {
			const signature = (call) => [
				call.method, call.table, call.params.get('select') ?? '',
				call.params.get('resource_type') ?? '', call.params.get('workspace_id') ?? '',
				call.params.has('id') ? 'id' : '', call.params.has('resource_id') ? 'resource_id' : '',
			].join('|');
			for (const headers of [asB, asC]) {
				const startUnknown = mock.calls.length;
				assert.equal((await send(base, rulesUrl(UNKNOWN, true), headers)).status, 404);
				const unknownCalls = mock.calls.slice(startUnknown).map(signature);
				const startPrivate = mock.calls.length;
				assert.equal((await send(base, rulesUrl(IDS.privateA, true), headers)).status, 404);
				const privateCalls = mock.calls.slice(startPrivate).map(signature);
				assert.deepEqual(privateCalls, unknownCalls);
			}
		});
	});
});

describe('C602: a failed read is a 503 page_access_unavailable, never a rules array', () => {
	const failOn = (kind) => (call) => {
		if (kind === 'rules' && call.table === 'osionos_share_rules') return { status: 500, body: { code: 'XX' } };
		if (kind === 'parent' && call.table === 'osionos_pages'
			&& String(call.params.get('select') ?? '').includes('parent_page_id')
			&& call.params.has('workspace_id')) return { status: 500, body: { code: 'XX' } };
		if (kind === 'page' && call.table === 'osionos_pages' && call.params.has('id')) return { status: 500, body: { code: 'XX' } };
		return null;
	};

	for (const kind of ['rules', 'parent', 'page']) {
		it(`${kind} read failure, resourceId form`, async () => {
			await withWorld(world(), async (base) => {
				const answer = await send(base, rulesUrl(IDS.sharedA, true), asB);
				assert.equal(answer.status, 503, answer.text);
				assert.equal(answer.body?.code, 'page_access_unavailable');
				assert.equal(Object.hasOwn(answer.body, 'rules'), false);
			}, { failWhen: failOn(kind) });
		});

		it(`${kind} read failure, list form`, async () => {
			await withWorld(world(), async (base) => {
				const answer = await send(base, rulesUrl(), asB);
				assert.equal(answer.status, 503, answer.text);
				assert.equal(answer.body?.code, 'page_access_unavailable');
				assert.equal(Object.hasOwn(answer.body, 'rules'), false);
			}, { failWhen: failOn(kind) });
		});
	}
});

describe('C603: non-page rule types', () => {
	it('a member never reads a database rule; the workspace owner does, and resourceId= is the list form', async () => {
		const seeded = world();
		seeded.osionos_share_rules.push(rule({
			id: 'e1000000-0000-4000-8000-000000000201', resource_type: 'database', resource_id: DB_RULE,
		}));
		await withWorld(seeded, async (base, mock) => {
			assert.equal((await send(base, rulesUrl(DB_RULE), asB)).status, 404);
			assert.equal((await send(base, rulesUrl(), asB)).body.rules.some((entry) => entry.resourceType === 'database'), false);
			const owner = await send(base, rulesUrl(DB_RULE), asA);
			assert.equal(owner.status, 200, owner.text);
			assert.deepEqual(owner.body.rules.map((entry) => entry._id), ['e1000000-0000-4000-8000-000000000201']);
			const ownerList = await send(base, rulesUrl(), asA);
			assert.equal(ownerList.body.rules.some((entry) => entry.resourceType === 'database'), true);
			// `resourceId=` is the list form: no page lookup at all, no 500.
			const before = mock.calls.length;
			const empty = await send(base, rulesUrl(''), asB);
			assert.equal(empty.status, 200, empty.text);
			assert.equal(mock.calls.slice(before).some((call) => call.table === 'osionos_pages'
				&& String(call.params.get('id') ?? '').startsWith('eq.')), false, 'no single-page lookup for an empty id');
		});
	});
});

describe('C604: inherited forces page metadata, and a zero-rule workspace reads no parent map', () => {
	it('a deny-only workspace still reads owner_id and visibility, and reaches for a deny is true', async () => {
		const seeded = teamWorld();
		seeded.osionos_pages.push(
			teamPage(DENY_PAGE, IDS.userA, 'shared', 'Deny page', 'deny page'),
			teamPage(DENY_PARENT, IDS.userA, 'shared', 'Deny parent', 'deny parent'),
		);
		seeded.osionos_pages.find((page) => page.id === DENY_PAGE).parent_page_id = DENY_PARENT;
		seeded.osionos_share_rules = [rule({
			id: 'e1000000-0000-4000-8000-000000000301', resource_id: DENY_PARENT,
			target: { type: 'user', userId: ADMIN }, permission: 'no_access',
		})];
		const mock = createPostgrestMock(seeded, { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, rulesUrl(DENY_PAGE, true), asB);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.inherited.length, 1);
			assert.equal(answer.body.inherited[0].reaches, true, 'a deny always reaches');
			const parentRead = mock.calls.find((call) => call.table === 'osionos_pages'
				&& String(call.params.get('select') ?? '').includes('parent_page_id') && call.params.has('workspace_id'));
			assert.match(String(parentRead?.params.get('select')), /owner_id/, 'deny-only + inherited reads pageMeta');
			assert.match(String(parentRead?.params.get('select')), /visibility/);
		});
	});

	it('no rule: inherited is [] and the parent map is never read', async () => {
		const mock = createPostgrestMock(teamWorld(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, rulesUrl(IDS.sharedA, true), asB);
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body.inherited, []);
			assert.equal(mock.calls.some((call) => call.table === 'osionos_pages'
				&& String(call.params.get('select') ?? '').includes('parent_page_id') && call.params.has('workspace_id')), false);
		});
	});
});

describe('C605: the list form is wide rules plus pages the caller can read', () => {
	it('a private-page rule is shown to its owner only; a shared-page rule to its reader', async () => {
		const seeded = world();
		seeded.osionos_share_rules.push(
			rule({ id: 'e1000000-0000-4000-8000-000000000401', resource_id: IDS.privateA, target: { type: 'user', userId: ADMIN } }),
			rule({ id: 'e1000000-0000-4000-8000-000000000402', resource_id: IDS.sharedA }),
		);
		await withWorld(seeded, async (base) => {
			const member = await send(base, rulesUrl(), asB);
			assert.equal(member.status, 200, member.text);
			const memberIds = member.body.rules.map((entry) => entry._id);
			assert.equal(memberIds.includes('e1000000-0000-4000-8000-000000000401'), false, 'B cannot read A private');
			assert.equal(memberIds.includes('e1000000-0000-4000-8000-000000000402'), true, 'B reads A shared');
			const owner = await send(base, rulesUrl(), asA);
			assert.equal(owner.body.rules.some((entry) => entry._id === 'e1000000-0000-4000-8000-000000000401'), true);
			const admin = await send(base, rulesUrl(), asC);
			assert.equal(admin.body.rules.some((entry) => entry._id === 'e1000000-0000-4000-8000-000000000401'), false, 'admin gets no private-page exemption');
		});
	});
});

describe('C607: workspace-wide rules on the resource form go to the workspace owner/admin only', () => {
	it('a member sees the page rule, the owner sees it with the wide rule', async () => {
		const seeded = teamWorld();
		seeded.osionos_share_rules = [
			rule({ id: 'e1000000-0000-4000-8000-000000000501', resource_id: IDS.sharedA }),
			rule({ id: 'e1000000-0000-4000-8000-000000000502', resource_id: '', target: { type: 'workspace' }, permission: 'can_edit' }),
		];
		const mock = createPostgrestMock(seeded, { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const member = await send(base, rulesUrl(IDS.sharedA), asB);
			assert.equal(member.status, 200, member.text);
			assert.deepEqual(member.body.rules.map((entry) => entry._id), ['e1000000-0000-4000-8000-000000000501']);
			const owner = await send(base, rulesUrl(IDS.sharedA), asA);
			assert.deepEqual(owner.body.rules.map((entry) => entry._id).sort(), [
				'e1000000-0000-4000-8000-000000000501', 'e1000000-0000-4000-8000-000000000502',
			]);
		});
	});
});

describe('C608: inherited rows say what is above, and never name an ancestor the caller cannot read', () => {
	it('nearest readable ancestor first; an unreadable denying ancestor contributes only hiddenInherited', async () => {
		await withWorld(world(), async (base) => {
			const answer = await send(base, rulesUrl(LEAF_PRIVATE, true), asB);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.hiddenInherited, true);
			assert.deepEqual(answer.body.inherited.map((entry) => entry.fromPageId), [MID_SHARED]);
			assert.equal(answer.body.inherited[0].reaches, false, 'a shared ancestor cannot raise a private page');
			assert.equal(answer.body.inherited[0].rule._id, 'e1000000-0000-4000-8000-000000000103');
			assert.equal(answer.text.includes(ROOT_PRIVATE), false, 'no unreadable ancestor id');
			assert.equal(answer.text.includes(ADMIN), false, 'no target id from an unreadable ancestor');
			assert.equal(answer.text.includes('no_access'), false, 'no permission from an unreadable ancestor');
		});
	});

	it('two readable ancestors come back nearest first', async () => {
		await withWorld(world(), async (base) => {
			const answer = await send(base, rulesUrl(P2, true), asB);
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body.inherited.map((entry) => entry.fromPageId), [P2_A1, P2_A2]);
			assert.deepEqual(answer.body.inherited.map((entry) => entry.reaches), [true, true]);
		});
	});
});

describe('C609: reaches is the structural property decidePageAccess changes under', () => {
	// P is private and shared with the target as a collaborator, so the baseline is can_view
	// and a deny measurably changes it. A foreign can_comment lifts that collaborator to
	// can_comment (privatePageDecision), so it reaches from outside the owner run too.
	const OWNER = 'f1000000-0000-4000-8000-000000000001';
	const TARGET = 'f1000000-0000-4000-8000-000000000002';
	const P = 'f1000000-0000-4000-8000-000000000010';
	const A1 = 'f1000000-0000-4000-8000-000000000011';
	const A2 = 'f1000000-0000-4000-8000-000000000012';
	const row = {
		id: P, workspace_id: W, owner_id: OWNER, visibility: 'private',
		collaborators: [{ userId: TARGET, role: 'viewer' }],
	};
	const parentOf = new Map([[P, A1], [A1, A2], [A2, null]]);
	const pageMetaFor = (a1 = {}, a2 = {}) => new Map([
		[A1, { owner_id: OWNER, visibility: 'private', ...a1 }],
		[A2, { owner_id: OWNER, visibility: 'private', ...a2 }],
	]);
	const cases = [
		{ name: 'deny on P', at: P, permission: 'no_access', meta: pageMetaFor() },
		{ name: 'grant on P', at: P, permission: 'can_edit', meta: pageMetaFor() },
		{ name: 'deny on owner-run parent', at: A1, permission: 'no_access', meta: pageMetaFor() },
		{ name: 'grant on owner-run parent', at: A1, permission: 'can_comment', meta: pageMetaFor() },
		{ name: 'deny on shared parent', at: A1, permission: 'no_access', meta: pageMetaFor({ visibility: 'shared' }) },
		{ name: 'grant on shared parent', at: A1, permission: 'can_edit', meta: pageMetaFor({ visibility: 'shared' }) },
		{ name: 'grant on other owner parent', at: A1, permission: 'can_edit', meta: pageMetaFor({ owner_id: TARGET }) },
		{ name: 'grant on owner-run grandparent', at: A2, permission: 'can_edit', meta: pageMetaFor() },
		{ name: 'grant on grandparent behind a shared parent', at: A2, permission: 'can_edit', meta: pageMetaFor({ visibility: 'shared' }) },
		{ name: 'deny on grandparent behind a shared parent', at: A2, permission: 'no_access', meta: pageMetaFor({ visibility: 'shared' }) },
		{ name: 'grant on grandparent behind another owner', at: A2, permission: 'can_edit', meta: pageMetaFor({ owner_id: TARGET }) },
		{ name: 'deny on grandparent behind another owner', at: A2, permission: 'no_access', meta: pageMetaFor({ owner_id: TARGET }) },
		{ name: 'grant on shared grandparent', at: A2, permission: 'can_edit', meta: pageMetaFor({}, { visibility: 'shared' }) },
		{ name: 'grant on owner-run parent with full access', at: A1, permission: 'full_access', meta: pageMetaFor() },
		{ name: 'can_comment on shared parent', at: A1, permission: 'can_comment', meta: pageMetaFor({ visibility: 'shared' }) },
		{ name: 'can_comment on other owner grandparent', at: A2, permission: 'can_comment', meta: pageMetaFor({}, { owner_id: TARGET }) },
	];

	it('over-reports a foreign can_view, which leaves a collaborator at can_view', () => {
		const rule = { resource_type: 'page', resource_id: A1, target: { type: 'user', userId: TARGET }, permission: 'can_view' };
		assert.equal(ruleReachesPage({ rule, row, ancestorId: A1, path: [A1], pageMeta: pageMetaFor({ visibility: 'shared' }) }), true);
	});

	it('holds on a hand table of 16 chains; a reaches flag matches a real level change', () => {
		assert.ok(cases.length >= 12);
		for (const item of cases) {
			const itemRule = { resource_type: 'page', resource_id: item.at, target: { type: 'user', userId: TARGET }, permission: item.permission };
			const withRules = new Map([[item.at, [itemRule]]]);
			const path = item.at === P ? [] : item.at === A1 ? [A1] : [A1, A2];
			const reaches = ruleReachesPage({ rule: itemRule, row, ancestorId: item.at, path, pageMeta: item.meta });
			const base = { row, userId: TARGET, member: { role: 'viewer' }, parentOf, pageMeta: item.meta, teamIds: [] };
			const withRule = pageAccessLevel({ ...base, rulesByPage: withRules });
			const withoutRule = pageAccessLevel({ ...base, rulesByPage: new Map() });
			assert.equal(reaches, withRule !== withoutRule, item.name);
		}
	});
});

describe('C610: non-admin writes keep uniform refusals', () => {
	it('unknown, foreign and another member\'s private page answer byte-identical 403s', async () => {
		await withWorld(world(), async (base, mock) => {
			const before = mock.rows('osionos_share_rules').length;
			const bodies = [];
			for (const id of [UNKNOWN, FOREIGN, IDS.privateA]) {
				const answer = await send(base, '/api/perms/rules', asB, post({
					workspaceId: W, resourceType: 'page', resourceId: id, permission: 'can_view',
					target: { type: 'user', userId: IDS.userB },
				}));
				assert.equal(answer.status, 403, `${id}: ${answer.text}`);
				bodies.push(answer.text);
			}
			assert.equal(new Set(bodies).size, 1);
			assert.equal(mock.rows('osionos_share_rules').length, before, 'refused writes store nothing');
		});
	});
});

describe('C611: an admin may still clean up a grant on another member\'s private page', () => {
	it('deletes the grant by id and still refuses the deny', async () => {
		const seeded = teamWorld();
		seeded.osionos_workspace_members.push({ workspace_id: W, user_id: ADMIN, role: 'admin', permissions: ALL });
		seeded.osionos_share_rules = [
			rule({ id: 'e1000000-0000-4000-8000-000000000601', resource_id: IDS.privateA }),
			rule({ id: 'e1000000-0000-4000-8000-000000000602', resource_id: IDS.privateA, permission: 'no_access' }),
		];
		const mock = createPostgrestMock(seeded, { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, '/api/perms/rules/e1000000-0000-4000-8000-000000000602', asC, { method: 'DELETE' })).status, 404);
			assert.equal((await send(base, '/api/perms/rules/e1000000-0000-4000-8000-000000000601', asC, { method: 'DELETE' })).status, 200);
			assert.deepEqual(mock.rows('osionos_share_rules').map((entry) => entry.id), ['e1000000-0000-4000-8000-000000000602']);
		});
	});
});

describe('C613: an old client still sees only rules and teamRules', () => {
	it('neither form grows a key unless &inherited=1 asks for it', async () => {
		await withWorld(world(), async (base) => {
			for (const url of [rulesUrl(LEAF_PRIVATE), rulesUrl()]) {
				const answer = await send(base, url, asB);
				assert.equal(answer.status, 200, answer.text);
				assert.deepEqual(Object.keys(answer.body).sort(), ['rules', 'teamRules']);
			}
		});
	});
});

describe('C614: ids are normalised and never injected into a filter', () => {
	it('an upper-case page id answers what the lower-case id answers', async () => {
		const seeded = teamWorld();
		seeded.osionos_share_rules = [rule({ resource_id: IDS.sharedA })];
		const mock = createPostgrestMock(seeded, { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const lower = await send(base, rulesUrl(IDS.sharedA, true), asB);
			const upper = await send(base, rulesUrl(IDS.sharedA.toUpperCase(), true), asB);
			assert.equal(upper.status, 200, upper.text);
			assert.deepEqual(upper.body, lower.body);
		});
	});

	it('x,y) and * are 404s and never reach an upstream call', async () => {
		await withWorld(world(), async (base, mock) => {
			for (const token of ['x,y)', '*']) {
				const before = mock.calls.length;
				for (const headers of [asB, asA]) {
					const answer = await send(base, rulesUrl(token, true), headers);
					assert.equal(answer.status, 404, `${token}: ${answer.text}`);
				}
				for (const call of mock.calls.slice(before)) {
					assert.equal(call.params.toString().includes(token), false, `${token} reached ${call.table}`);
				}
			}
		});
	});
});
