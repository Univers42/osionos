// GET /api/profile/:userId/shares must not send a query the baas WAF blocks: CRS 930120 matches
// ".profile" (an OS dotfile) anywhere in the decoded arguments, so `target=eq.profile` was a 403
// for every viewer while the same rows read fine without that filter.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const PAGE_PROFILE = 'cccccccc-3333-4333-8333-cccccccccccc';
const PAGE_FEED = 'dddddddd-4444-4444-8444-dddddddddddd';

function world() {
	return createPostgrestMock({
		osionos_feed_shares: [
			{ id: 1, user_id: IDS.userA, page_id: PAGE_PROFILE, target: 'profile', created_at: '2026-10-18T10:00:00.000Z' },
			{ id: 2, user_id: IDS.userA, page_id: PAGE_FEED, target: 'feed', created_at: '2026-10-18T11:00:00.000Z' },
		],
		osionos_pages: [
			{ id: PAGE_PROFILE, title: 'On my profile', workspace_id: IDS.homeA, owner_id: IDS.userA, visibility: 'workspace' },
			{ id: PAGE_FEED, title: 'Feed only', workspace_id: IDS.homeA, owner_id: IDS.userA, visibility: 'workspace' },
		],
		osionos_workspace_members: [{ workspace_id: IDS.homeA, user_id: IDS.userA, role: 'owner', permissions: ['read'] }],
	});
}

describe('GET /api/profile/:userId/shares', () => {
	it('lists only the profile-target shares', async () => {
		const mock = world();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const { status, body } = await send(base, `/api/profile/${IDS.userA}/shares`, asA);
			assert.equal(status, 200);
			assert.deepEqual(body.shares.map((share) => share.pageId), [PAGE_PROFILE]);
		});
	});

	it('never puts ".profile" in a baas query, where the WAF would 403 it', async () => {
		const mock = world();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, `/api/profile/${IDS.userA}/shares`, asA);
		});
		const shareCalls = mock.calls.filter((call) => call.table === 'osionos_feed_shares');
		assert.ok(shareCalls.length > 0);
		for (const call of mock.calls) {
			assert.ok(!decodeURIComponent(call.params.toString()).toLowerCase().includes('.profile'), `${call.table}?${call.params}`);
		}
	});
});
