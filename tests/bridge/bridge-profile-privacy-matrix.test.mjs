// U5: who sees what of a person, on every route that shows a person. One table drives it:
// viewer (self, stranger, blocked by the subject, has blocked the subject) x subject (normal,
// opted out, unknown id) x route (legacy profile, account card, counts, followers, following).
// A hidden subject must be indistinguishable from an unknown id, and a failed lookup is a 503.

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialHandler } from '../../scripts/bridge-social.mjs';
import { createProfileHandler } from '../../scripts/bridge-profile.mjs';
import { createAccountProfileRoutes } from '../../scripts/bridge-account-profile.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { callRoute } from './support/route-call.mjs';
import { CONFIG, createFollowStore, uid } from './support/follow-postgrest.mjs';

const SUBJECT = uid(10);
const STRANGER = uid(1);
const UNKNOWN = uid(99);
const at = (minute) => `2026-10-22T10:${String(minute).padStart(2, '0')}:00.000000+00:00`;
const TEAM = uid(500);

// The people around the subject: 2 and 6 are plain, 3 opted out, 4 is blocked by the viewer, 5 blocked the viewer.
const AROUND = [2, 3, 4, 5, 6].map(uid);
const VISIBLE_AROUND = [uid(6), uid(2)];

const VIEWERS = {
	self: { id: SUBJECT, blocks: [] },
	stranger: { id: STRANGER, blocks: [] },
	'blocked by the subject': { id: STRANGER, blocks: [{ blocker_id: SUBJECT, blocked_id: STRANGER }] },
	'has blocked the subject': { id: STRANGER, blocks: [{ blocker_id: STRANGER, blocked_id: SUBJECT }] },
};

function profileRow(userId, name, optedOut = false) {
	return { user_id: userId, username: name.toLowerCase(), display_name: name, directory_opt_out: optedOut, avatar_url: null, headline: `${name} headline` };
}

function world({ viewer, optedOut = false, failWhen }) {
	const everyone = [SUBJECT, STRANGER, ...AROUND];
	const blocks = [...viewer.blocks, { blocker_id: viewer.id, blocked_id: uid(4) }, { blocker_id: uid(5), blocked_id: viewer.id }];
	const follows = [
		...AROUND.map((id, index) => ({ follower_id: id, followee_id: SUBJECT, created_at: at(index) })),
		...[...AROUND, uid(7)].map((id, index) => ({ follower_id: SUBJECT, followee_id: id, created_at: at(index) })),
	];
	const profiles = everyone.map((id) => profileRow(id, `User${Number.parseInt(id, 10)}`, id === uid(3) || (id === SUBJECT && optedOut)));
	const store = createFollowStore({
		users: [...everyone, uid(7)].map((id) => ({ user_id: id, display_name: `User${Number.parseInt(id, 10)}`, profile: {} })),
		blocks,
		follows,
		failWhen,
		tables: {
			osionos_profiles: profiles,
			osionos_bridge_identities: [{ user_id: SUBJECT, display_name: 'User10', username: 'user10', directory_opt_out: optedOut, profile: { bio: 'bio', fields: { phone: '555' } }, created_at: at(0), last_seen_at: at(1) }],
			osionos_workspace_members: [{ workspace_id: TEAM, user_id: SUBJECT, role: 'owner' }],
		},
	});
	const verifySession = (token) => {
		if (!token) throw Object.assign(new Error('An app session is required.'), { status: 401 });
		return { userId: viewer.id };
	};
	const pg = { asService: () => ({ get: async (path) => {
		const answer = await store.fetchImpl(`${CONFIG.baasUrl}/rest/v1/${path}`);
		if (!answer.ok) throw Object.assign(new Error('upstream'), { upstreamStatus: answer.status, upstreamText: await answer.text() });
		return await answer.json();
	} }) };
	const kv = kvStub();
	const social = createSocialHandler({ config: CONFIG, verifySession, fetchImpl: store.fetchImpl, kv });
	const legacy = createProfileHandler({ config: CONFIG, verifySession, fetchImpl: store.fetchImpl, env: {}, kv, now: () => Date.parse(at(30)) });
	const account = createAccountProfileRoutes({ config: CONFIG, pg, kv, verifySession });
	return {
		store,
		counts: (id) => callRoute(social, { path: `/api/social/follow-counts/${id}` }),
		followers: (id) => callRoute(social, { path: `/api/social/followers/${id}?limit=50` }),
		following: (id) => callRoute(social, { path: `/api/social/following/${id}?limit=50` }),
		profile: (id) => callRoute(legacy, { path: `/api/profile/${id}` }),
		card: (name) => callRoute(account, { path: `/api/users/${name}` }),
		anonymous: (route) => callRoute(route.handler, { path: route.path, headers: { authorization: '' } }),
		handlers: { social, legacy, account },
	};
}

const FULL_LEGACY = ['avatar', 'bio', 'customFields', 'directoryOptOut', 'headline', 'joinedAt', 'lastSeenAt', 'location', 'name', 'ok', 'online', 'presence', 'role', 'status', 'userId', 'username', 'workspaceId'];
const VISITOR_LEGACY = FULL_LEGACY.filter((key) => key !== 'role' && key !== 'workspaceId');
const MINIMAL_LEGACY = ['avatar', 'name', 'ok', 'userId'];
const FULL_CARD = ['avatarUrl', 'bannerUrl', 'bio', 'company', 'displayName', 'headline', 'links', 'location', 'orcid', 'patreon', 'profession', 'pronouns', 'status', 'timezone', 'userId', 'username', 'website'];
const REDUCED_CARD = ['avatarUrl', 'displayName', 'userId', 'username'];
const ZERO_COUNTS = { ok: true, followerCount: 0, followingCount: 0, viewerFollows: false };

const keys = (body) => Object.keys(body).sort();
const ids = (answer) => answer.body.items.map((item) => item.id);

/** A subject is hidden from a viewer who is not the subject, when it opted out or a block lies between them. */
function isHidden(viewerName, optedOut) {
	if (viewerName === 'self') return false;
	return optedOut || viewerName !== 'stranger';
}

describe('U5 privacy matrix', () => {
	for (const [viewerName, viewer] of Object.entries(VIEWERS)) {
		for (const optedOut of [false, true]) {
			const hidden = isHidden(viewerName, optedOut);
			const label = `${viewerName} looks at a ${optedOut ? 'opted-out' : 'normal'} subject`;

			it(`${label}: the legacy profile`, async () => {
				const { profile } = world({ viewer, optedOut });
				const answer = await profile(SUBJECT);
				assert.equal(answer.status, 200);
				const expected = hidden ? MINIMAL_LEGACY : (viewerName === 'self' ? FULL_LEGACY : VISITOR_LEGACY);
				assert.deepEqual(keys(answer.body), expected);
				if (viewerName === 'self') {
					assert.deepEqual([answer.body.role, answer.body.workspaceId, answer.body.customFields], ['owner', TEAM, { phone: '555' }]);
				} else if (!hidden) {
					assert.deepEqual(answer.body.customFields, {}, 'no custom field is public until a human rules it so');
				}
			});

			it(`${label}: the account card`, async () => {
				const { card } = world({ viewer, optedOut });
				const answer = await card('user10');
				assert.equal(answer.status, 200);
				assert.deepEqual(keys(answer.body), hidden ? REDUCED_CARD : FULL_CARD);
			});

			it(`${label}: the counts`, async () => {
				const { counts } = world({ viewer, optedOut });
				const answer = await counts(SUBJECT);
				const unknown = await counts(UNKNOWN);
				assert.equal(answer.status, 200);
				if (hidden) {
					assert.deepEqual({ status: answer.status, headers: answer.headers, text: answer.text }, { status: unknown.status, headers: unknown.headers, text: unknown.text });
					assert.deepEqual(answer.body, ZERO_COUNTS);
				} else {
					assert.deepEqual(answer.body, { ok: true, followerCount: 5, followingCount: 6, viewerFollows: false });
				}
			});

			for (const kind of ['followers', 'following']) {
				it(`${label}: the ${kind} list`, async () => {
					const w = world({ viewer, optedOut });
					const answer = await w[kind](SUBJECT);
					const unknown = await w[kind](UNKNOWN);
					assert.equal(answer.status, 200);
					if (hidden) {
						assert.deepEqual({ status: answer.status, headers: answer.headers, text: answer.text }, { status: unknown.status, headers: unknown.headers, text: unknown.text });
						assert.deepEqual(answer.body, { ok: true, items: [], nextCursor: null });
						return;
					}
					// 4 is blocked by the viewer, 5 blocked the viewer, 3 opted out: none of them is listed.
					assert.deepEqual(ids(answer), kind === 'followers' ? VISIBLE_AROUND : [uid(7), ...VISIBLE_AROUND]);
				});
			}
		}
	}

	it('an unknown id is a 404 on the two profile routes and an empty answer on the follow routes', async () => {
		const w = world({ viewer: VIEWERS.stranger });
		assert.equal((await w.profile(UNKNOWN)).status, 404);
		assert.equal((await w.card('nobody')).status, 404);
		assert.deepEqual((await w.counts(UNKNOWN)).body, ZERO_COUNTS);
		assert.deepEqual((await w.followers(UNKNOWN)).body, { ok: true, items: [], nextCursor: null });
	});

	it('the subject sees the same followers whether or not it opted out (the viewer is never hidden from itself)', async () => {
		const { followers } = world({ viewer: VIEWERS.self, optedOut: true });
		assert.deepEqual(ids(await followers(SUBJECT)), VISIBLE_AROUND);
	});

	const failures = {
		'the block list': (name) => name === 'osionos_user_blocks',
		'the opt-out read': (name, params) => name === 'osionos_profiles' && params.has('directory_opt_out') && params.get('directory_opt_out') === 'eq.true',
	};
	for (const [what, failWhen] of Object.entries(failures)) {
		it(`answers 503 on every route when ${what} fails, and never the full answer`, async () => {
			const w = world({ viewer: VIEWERS.stranger, failWhen });
			const answers = {
				profile: await w.profile(SUBJECT),
				card: await w.card('user10'),
				counts: await w.counts(SUBJECT),
				followers: await w.followers(SUBJECT),
				following: await w.following(SUBJECT),
			};
			for (const [route, answer] of Object.entries(answers)) assert.equal(answer.status, 503, `${route}: ${answer.status} ${answer.text.slice(0, 80)}`);
		});
	}

	it('answers 401 to an anonymous caller on every route', async () => {
		const w = world({ viewer: VIEWERS.stranger });
		const routes = [
			{ handler: w.handlers.social, path: `/api/social/follow-counts/${SUBJECT}` },
			{ handler: w.handlers.social, path: `/api/social/followers/${SUBJECT}` },
			{ handler: w.handlers.social, path: `/api/social/following/${SUBJECT}` },
			{ handler: w.handlers.legacy, path: `/api/profile/${SUBJECT}` },
			{ handler: w.handlers.account, path: '/api/users/user10' },
		];
		for (const route of routes) assert.equal((await w.anonymous(route)).status, 401, route.path);
	});

	it('the reduced card shows no counts: the counts of its subject are the answer for an unknown id', async () => {
		const w = world({ viewer: VIEWERS['has blocked the subject'], optedOut: true });
		assert.deepEqual(keys((await w.card('user10')).body), REDUCED_CARD);
		assert.deepEqual((await w.counts(SUBJECT)).body, ZERO_COUNTS);
	});
});

describe('U5 one predicate', () => {
	const read = (file) => readFileSync(new URL(`../../scripts/${file}`, import.meta.url), 'utf8');
	const ROUTES = ['bridge-social-follows.mjs', 'bridge-profile.mjs', 'bridge-account-profile.mjs'];

	it('defines hiddenFrom once, and every route module imports it from there', () => {
		const defining = ['bridge-social-core.mjs', 'bridge-hidden-from.mjs', ...ROUTES].filter((file) => /export (async )?function hiddenFrom\b/.test(read(file)));
		assert.deepEqual(defining, ['bridge-hidden-from.mjs']);
		for (const file of ROUTES) assert.match(read(file), /from '\.\/bridge-hidden-from\.mjs'/, file);
	});

	it('leaves no second copy of the rule in the route modules it governs', () => {
		assert.doesNotMatch(read('bridge-account-profile.mjs'), /blockedViewerBy|directory_opt_out\s*===\s*true/);
		// The follow write is the one block check outside the rule (opt-out must not forbid following).
		assert.equal(read('bridge-social-follows.mjs').match(/blockedViewerBy\(/g).length, 1);
		assert.doesNotMatch(read('bridge-social-follows.mjs'), /directory_opt_out/);
		const withoutSearch = read('bridge-profile.mjs').replace(/async function searchPeople[\s\S]*?\nasync function patchMe/, '');
		assert.doesNotMatch(withoutSearch, /blockedViewerBy\(/);
	});
});
