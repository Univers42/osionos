/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-sites.test.mjs                     +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 16:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 16:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The gate on the FIVE MORE public-facing writes: a profile, a community, a
 * channel message, a published page, a marketplace app.
 *
 * WARN-ONLY: these five tables have no `moderation_state` column, so nothing
 * is ever written held and no audit row is ever written. A verdict is the
 * AUTHOR'S QUESTION (409) and the author answers it with
 * `acknowledgeWarning: true` — then the write happens.
 *
 * The blocklisted word is READ from the list at runtime, never pasted here:
 * the test must follow the list, not a copy of it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamPage, withBridge } from './support/bridge-harness.mjs';
import { pageContentText } from '../../scripts/bridge-api.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);

const LIST = readFileSync(new URL('../../scripts/moderation-lists/en.txt', import.meta.url), 'utf8')
	.split('\n')
	.map((line) => line.trim())
	.filter((line) => line.length > 0);
const TERM = LIST.find((term) => /^[a-z]{4,}$/.test(term));
const BLOCKED = `what a ${TERM} you are`;

const CHANNEL = '11111111-aaaa-4aaa-8aaa-111111111111';
const BLOCKED_CHANNEL = '22222222-aaaa-4aaa-8aaa-222222222222';
const DM = '33333333-aaaa-4aaa-8aaa-333333333333';
const COMMUNITY = '44444444-aaaa-4aaa-8aaa-444444444444';
const PAGE = '55555555-aaaa-4aaa-8aaa-555555555555';
const BLOCKED_PAGE = '66666666-aaaa-4aaa-8aaa-666666666666';
const APP = '77777777-aaaa-4aaa-8aaa-777777777777';
const BLOCKED_APP = '88888888-aaaa-4aaa-8aaa-888888888888';
const MESSAGE = '99999999-aaaa-4aaa-8aaa-999999999999';
const MARKETPLACE_WORKSPACE = '5a4b1c2d-1111-4111-8111-000000000001';

/** The mode alone: the shadow. The mode and the state flag: the enforcement. */
const HOLD = { OSIONOS_MODERATION_ACTIONS: 'hold' };
/** The publish feature is flag-gated: without the flag the route is a 404. */
const PUBLISH_ON = { OSIONOS_PUBLISH_ENABLED: '1' };

/** A marketplace app page: the workspace the marketplace reads, its owner, its text. */
function appPage(id, title, text) {
	return {
		id, workspace_id: MARKETPLACE_WORKSPACE, owner_id: IDS.userA, visibility: 'private',
		title, icon: 'icon:box', surface: 'app', collaborators: [], properties: [],
		parent_page_id: null, archived_at: null, content: [{ id: `${id}-b1`, type: 'paragraph', content: text }],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

/**
 * One world for the seven writes: a profile, a community, a text channel, a DM,
 * a page, a marketplace app and a message of mine.
 *
 * The profile's bio carries the blocklisted word ON PURPOSE: the check reads
 * the words a PATCH sets, never the words the profile already had.
 */
function world() {
	return createPostgrestMock({
		osionos_bridge_identities: [{
			user_id: IDS.userA, display_name: 'Alice', username: 'alice', directory_opt_out: false,
			profile: { bio: `a bio with ${TERM} in it`, headline: 'CTO', location: 'Paris' },
			created_at: '2026-10-01T00:00:00.000Z', last_seen_at: '2026-10-01T00:00:00.000Z',
		}],
		osionos_channels: [
			{ id: CHANNEL, workspace_id: IDS.team, kind: 'text', is_private: false, name: 'general' },
			{ id: BLOCKED_CHANNEL, workspace_id: IDS.team, kind: 'text', is_private: false, name: `the ${TERM} room` },
			{ id: DM, workspace_id: IDS.team, kind: 'dm', is_private: true, name: 'Alice & Bob' },
		],
		osionos_channel_members: [
			{ channel_id: CHANNEL, user_id: IDS.userA, role: 'member' },
			{ channel_id: BLOCKED_CHANNEL, user_id: IDS.userA, role: 'member' },
			{ channel_id: DM, user_id: IDS.userA, role: 'member' },
		],
		osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] }],
		osionos_communities: [{ id: COMMUNITY, name: 'A community', creator_id: IDS.userA }],
		osionos_community_members: [{ community_id: COMMUNITY, user_id: IDS.userA, role: 'owner' }],
		osionos_messages: [{ id: MESSAGE, channel_id: CHANNEL, author_id: IDS.userA, content: 'an old message', created_at: '2026-10-01T00:00:00.000Z' }],
		osionos_pages: [
			teamPage(PAGE, IDS.userA, 'private', 'A quiet page', 'the page text'),
			teamPage(BLOCKED_PAGE, IDS.userA, 'private', `A ${TERM} page`, 'the page text'),
			appPage(APP, 'A quiet app', 'the app text'),
			appPage(BLOCKED_APP, `A ${TERM} app`, 'the app text'),
		],
	});
}

/**
 * The seven writes, and the table each of them writes. `blocked` says which
 * words the call carries; `ack` says whether the author answered the warning.
 */
const CASES = [
	{
		name: 'the profile PATCH',
		tables: ['osionos_bridge_identities'],
		ok: 200,
		method: 'PATCH',
		path: () => '/api/profile/me',
		body: (blocked) => (blocked ? { bio: BLOCKED } : { bio: 'a short bio' }),
	},
	{
		name: 'the community create',
		tables: ['osionos_communities', 'osionos_community_members'],
		ok: 201,
		method: 'POST',
		path: () => '/api/communities',
		body: (blocked) => (blocked ? { name: `the ${TERM} club`, description: 'a club' } : { name: 'the chess club', description: 'a club' }),
	},
	{
		name: 'the community channel add',
		tables: ['osionos_community_channels'],
		ok: 200,
		method: 'POST',
		path: () => `/api/communities/${COMMUNITY}/channels`,
		body: (blocked) => ({ channelId: blocked ? BLOCKED_CHANNEL : CHANNEL }),
	},
	{
		name: 'the channel message',
		tables: ['osionos_messages'],
		ok: 201,
		method: 'POST',
		path: () => `/api/chat/channels/${CHANNEL}/messages`,
		body: (blocked) => ({ content: blocked ? BLOCKED : 'a plain message' }),
	},
	{
		name: 'the channel message edit',
		tables: ['osionos_messages'],
		ok: 200,
		method: 'PATCH',
		path: () => `/api/chat/messages/${MESSAGE}`,
		body: (blocked) => ({ content: blocked ? BLOCKED : 'a plain edit' }),
	},
	{
		name: 'the publish',
		tables: ['osionos_published_pages'],
		ok: 200,
		method: 'POST',
		env: PUBLISH_ON,
		path: (blocked) => `/api/pages/${blocked ? BLOCKED_PAGE : PAGE}/publish`,
		body: (blocked) => ({ pageId: blocked ? BLOCKED_PAGE : PAGE }),
	},
	{
		name: 'the marketplace publish',
		tables: ['osionos_pages'],
		ok: 200,
		method: 'POST',
		path: () => '/api/marketplace/publish',
		body: (blocked) => ({ pageId: blocked ? BLOCKED_APP : APP }),
	},
];

/** The write the stub saw on a table: a POST or a PATCH. */
const writes = (mock, table) => mock.calls.filter((call) => call.table === table && (call.method === 'POST' || call.method === 'PATCH'));

/** One call on a case: the body carries the author's answer when there is one. */
function call(testCase, base, { blocked = false, ack = false } = {}) {
	const body = { ...testCase.body(blocked), ...(ack ? { acknowledgeWarning: true } : {}) };
	const init = testCase.method === 'PATCH' ? patch(body) : post(body);
	return send(base, testCase.path(blocked), asA, init);
}

for (const testCase of CASES) {
	const env = (mode) => ({ ...(testCase.env ?? {}), ...mode });

	describe(testCase.name, () => {
		it('hold + a blocklisted text: 409, and NOTHING is written', async () => {
			const mock = world();
			await withBridge(config, mock.fetchImpl, async (base) => {
				const answer = await call(testCase, base, { blocked: true });
				assert.equal(answer.status, 409, answer.text);
				assert.equal(answer.body.ok, false);
				assert.equal(answer.body.code, 'moderation_warning');
				assert.ok(Array.isArray(answer.body.reasons) && answer.body.reasons.length > 0, answer.text);
				for (const table of testCase.tables) assert.equal(writes(mock, table).length, 0, `${table} was written`);
			}, { env: env(HOLD) });
		});

		it('the author may post it anyway: the write happens', async () => {
			const mock = world();
			await withBridge(config, mock.fetchImpl, async (base) => {
				const answer = await call(testCase, base, { blocked: true, ack: true });
				assert.equal(answer.status, testCase.ok, answer.text);
				for (const table of testCase.tables) assert.equal(writes(mock, table).length, 1, `${table} was not written`);
			}, { env: env(HOLD) });
		});

		it('the mode unset (log): the write happens, and nobody is asked', async () => {
			const mock = world();
			await withBridge(config, mock.fetchImpl, async (base) => {
				const answer = await call(testCase, base, { blocked: true });
				assert.equal(answer.status, testCase.ok, answer.text);
				assert.notEqual(answer.body.code, 'moderation_warning');
				for (const table of testCase.tables) assert.equal(writes(mock, table).length, 1, `${table} was not written`);
			}, { env: env({}) });
		});

		it('a clean text in hold mode: the write happens', async () => {
			const mock = world();
			await withBridge(config, mock.fetchImpl, async (base) => {
				const answer = await call(testCase, base, { blocked: false });
				assert.equal(answer.status, testCase.ok, answer.text);
				for (const table of testCase.tables) assert.equal(writes(mock, table).length, 1, `${table} was not written`);
			}, { env: env(HOLD) });
		});
	});
}

describe('the two exceptions of this slice', () => {
	it('a DM is moderated by report only: the message is written, never asked', async () => {
		const mock = world();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/chat/channels/${DM}/messages`, asA, post({ content: BLOCKED }));
			assert.equal(answer.status, 201, answer.text);
			assert.notEqual(answer.body.code, 'moderation_warning');
			assert.equal(writes(mock, 'osionos_messages').length, 1);
		}, { env: HOLD });
	});

	it('a profile PATCH that only opts out of the directory asks nothing', async () => {
		const mock = world();
		await withBridge(config, mock.fetchImpl, async (base) => {
			// The stored bio carries the blocklisted word: the check reads the words
			// THIS PATCH sets, and this PATCH sets no word at all.
			const answer = await send(base, '/api/profile/me', asA, patch({ directoryOptOut: true }));
			assert.equal(answer.status, 200, answer.text);
			assert.notEqual(answer.body.code, 'moderation_warning');
			assert.equal(writes(mock, 'osionos_bridge_identities').length, 1);
		}, { env: HOLD });
	});
});

describe('pageContentText', () => {
	it('is still exported from bridge-api.mjs', () => {
		assert.equal(pageContentText([{ type: 'paragraph', content: 'a page' }]), 'a page');
	});

	// #61: a published page carries its layouts, so the words in their cells are checked too.
	it('reads the words inside layout cells: label, cell text and the blocks in the cell', () => {
		const layout = { type: 'layout', content: '', layoutCells: [{ label: 'About', content: 'side note', blocks: [{ type: 'paragraph', content: BLOCKED }] }] };
		assert.equal(pageContentText([layout]), `About side note ${BLOCKED}`);
	});
});
