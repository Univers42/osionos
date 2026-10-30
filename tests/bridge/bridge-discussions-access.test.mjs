/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-discussions-access.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #228 C9: accepting a suggestion is a page write, so pageDiscussionAccess.canWrite must
// agree with the page PATCH in every world — and a page the PATCH answers 404 for is a
// 404 here too. Plus the pure bounds of bridge-discussions-input.mjs (S10) and the probe.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pageDiscussionAccess } from '../../scripts/bridge-api.mjs';
import { createDiscussionProbe } from '../../scripts/bridge-discussions.mjs';
import { MAX_SPAN, findBlock, parseAnchor, parseEmoji, parseSuggestion } from '../../scripts/bridge-discussions-input.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();

function world({ memberRole, pageId, collaborator, permission }) {
	const seed = teamWorld({ memberRole });
	if (collaborator) seed.osionos_pages.find((row) => row.id === pageId).collaborators = [{ userId: IDS.userB, role: 'editor' }];
	seed.osionos_share_rules = permission
		? [{ id: 'rule', workspace_id: IDS.team, resource_type: 'page', resource_id: pageId, target: { type: 'user', userId: IDS.userB }, permission, explicit: true }]
		: [];
	return seed;
}

async function patchStatus(seed, pageId) {
	const mock = createPostgrestMock(seed);
	return withBridge(config, mock.fetchImpl, async (base) => {
		const result = await send(base, `/api/pages/${pageId}`, sessionHeaders(config, IDS.userB, IDS.homeB), patch({ title: 'Edited' }));
		return result.status;
	});
}

async function discussionAccess(seed, pageId) {
	const request = { headers: sessionHeaders(config, IDS.userB, IDS.homeB) };
	try {
		return await pageDiscussionAccess(request, pageId, config, createPostgrestMock(seed).fetchImpl);
	} catch (error) {
		return { status: error.status };
	}
}

describe('C9: canWrite is the page PATCH decision', () => {
	const worlds = [];
	for (const memberRole of ['viewer', 'editor']) {
		for (const pageId of [IDS.sharedA, IDS.privateA]) {
			for (const collaborator of [false, true]) {
				for (const permission of [null, 'can_view', 'can_comment', 'can_edit']) worlds.push({ memberRole, pageId, collaborator, permission });
			}
		}
	}

	for (const shape of worlds) {
		const name = `${shape.memberRole} · ${shape.pageId === IDS.sharedA ? 'shared' : 'private'} · ${shape.collaborator ? 'collaborator' : 'member'} · rule ${shape.permission ?? 'none'}`;
		it(name, async () => {
			const status = await patchStatus(world(shape), shape.pageId);
			const access = await discussionAccess(world(shape), shape.pageId);
			if (status === 404) return assert.equal(access.status, 404);
			assert.ok(status === 200 || status === 403, `PATCH answered ${status}`);
			assert.equal(access.canWrite, status === 200);
			// A writer can always comment; a rule's own level is never raised.
			if (access.canWrite) assert.ok(['can_edit', 'full_access'].includes(access.level), access.level);
			if (shape.permission && shape.permission !== 'can_edit') assert.equal(access.level, shape.permission);
		});
	}

	it('the page owner has full access', async () => {
		const seed = teamWorld();
		const access = await pageDiscussionAccess({ headers: sessionHeaders(config, IDS.userA, IDS.homeA) }, IDS.privateA, config, createPostgrestMock(seed).fetchImpl);
		assert.deepEqual([access.level, access.canWrite], ['full_access', true]);
	});
});

describe('S10: input bounds (code points, as the SQL counts them)', () => {
	it('an anchor names exactly the code points of its quote', () => {
		assert.deepEqual(parseAnchor({ start: 2, end: 3, quote: '😀' }), { start: 2, end: 3, quote: '😀', prefix: '', suffix: '' });
		assert.throws(() => parseAnchor({ start: 2, end: 4, quote: '😀' }), { status: 400 });
		assert.throws(() => parseAnchor({ start: 3, end: 2, quote: '' }), { status: 400 });
		assert.throws(() => parseAnchor({ start: 0, end: MAX_SPAN + 1, quote: 'x'.repeat(MAX_SPAN + 1) }), { status: 400 });
		assert.throws(() => parseAnchor({ start: 0.5, end: 1, quote: 'x' }), { status: 400 });
		assert.throws(() => parseAnchor([]), { status: 400 });
	});

	it('an insertion needs context, at most 16 code points each side', () => {
		assert.throws(() => parseAnchor({ start: 4, end: 4, quote: '' }), { status: 400 });
		assert.equal(parseAnchor({ start: 4, end: 4, quote: '', prefix: '😀'.repeat(16) }).prefix.length, 32);
		assert.throws(() => parseAnchor({ start: 4, end: 4, quote: '', suffix: 'x'.repeat(17) }), { status: 400 });
		assert.throws(() => parseAnchor({ start: 4, end: 4, quote: '', prefix: 7 }), { status: 400 });
	});

	it('an insert is at most 8000 UTF-8 bytes', () => {
		assert.deepEqual(parseSuggestion({ insert: 'é'.repeat(4000) }), { insert: 'é'.repeat(4000) });
		assert.throws(() => parseSuggestion({ insert: 'é'.repeat(4000) + 'x' }), { status: 400 });
		assert.throws(() => parseSuggestion({ insert: 3 }), { status: 400 });
	});

	it('an emoji is 1 to 16 code points with no space or control', () => {
		assert.equal(parseEmoji(encodeURIComponent('👍🏽')), '👍🏽');
		for (const bad of ['', '%20', 'a%0Ab', 'x'.repeat(17), '%E0%A4%A']) assert.throws(() => parseEmoji(bad), { status: 400 }, bad);
	});

	it('findBlock walks children and layout cells, and survives a deep tree', () => {
		const content = [{ id: 'a', children: [{ id: 'b', layoutCells: [{ blocks: [{ id: 'c', type: 'quote' }] }] }] }];
		assert.equal(findBlock(content, 'c').type, 'quote');
		assert.equal(findBlock(content, 'z'), null);
		let deep = { id: 'leaf' };
		for (let depth = 0; depth < 100_000; depth += 1) deep = { id: `n${depth}`, children: [deep] };
		assert.equal(findBlock([deep], 'leaf').id, 'leaf');
	});
});

describe('C16: the schema probe', () => {
	const reply = (status) => async () => new Response(status === 200 ? '[]' : '{"code":"42703"}', { status });

	it('caches an answer for 60 s and re-probes after', async () => {
		let calls = 0;
		let now = 0;
		const probe = createDiscussionProbe(async (...args) => { calls += 1; return reply(200)(...args); }, () => now);
		assert.equal(await probe(config), true);
		now = 59_000;
		assert.equal(await probe(config), true);
		assert.equal(calls, 2);
		now = 61_000;
		await probe(config);
		assert.equal(calls, 4);
	});

	it('a missing column is false; an outage throws and is not cached', async () => {
		assert.equal(await createDiscussionProbe(reply(400))(config), false);
		const outage = createDiscussionProbe(reply(503));
		await assert.rejects(outage(config), { status: 502 });
		await assert.rejects(outage(config), { status: 502 });
	});
});
