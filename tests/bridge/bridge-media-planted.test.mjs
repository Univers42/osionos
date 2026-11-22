// osionos#233 D233-12 (devil ruling 2026-11-22, "Failures 1"): signPaths signed any path that
// appeared in a page the caller can read, and the caller's own page is always readable. So anyone
// with an account who held a victim's bare URL planted it in a page of their own, signed it, and
// read it under enforce. A foreign path now signs only when its owner (the uploads segment) is the
// page's owner or a member of the page's workspace. These run the real readablePageAccess.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, patch, post, send } from './support/bridge-harness.mjs';
import { OTHER_PAGE, OTHER_WORKSPACE, asA, asB, asOutsider, inMembershipWorld, membershipWorld } from './support/membership-world.mjs';

const SECRET = 'media-url-secret-for-tests-0123456789';
const victimPath = (key) => `/api/media/uploads/${IDS.userA}/${key.repeat(64)}.png`;
const memberPath = `/api/media/uploads/${IDS.userB}/${'e'.repeat(64)}.png`;
const PLANTED_PAGE = 'e2e2e2e2-6666-4666-8666-e2e2e2e2e2e2';
const WORKSPACE_OWNER = 'f0f0f0f0-7777-4777-8777-f0f0f0f0f0f0';
const ownerPath = `/api/media/uploads/${WORKSPACE_OWNER}/${'d'.repeat(64)}.png`;

const sign = (base, headers, body) => send(base, '/api/media/uploads/sign', headers, post(body));
const imageBlock = (id, path) => ({ id, type: 'image', content: `http://bridge.example${path}` });
const membershipReads = (mock) => mock.calls.filter((call) => call.table === 'osionos_workspace_members'
	&& String(call.params.get('user_id')).startsWith('in.'));

// The media handler reads MEDIA_URL_SECRET when the server is built; it is set for this file only.
let saved;
before(() => { saved = process.env.MEDIA_URL_SECRET; process.env.MEDIA_URL_SECRET = SECRET; });
after(() => { if (saved === undefined) delete process.env.MEDIA_URL_SECRET; else process.env.MEDIA_URL_SECRET = saved; });

describe('the planted-path repro signs nothing', () => {
	it('an outsider who writes the victim\'s path into their own page gets no signature', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base) => {
			const planted = await send(base, `/api/pages/${OTHER_PAGE}`, asOutsider(), patch({ content: [imageBlock('p1', victimPath('a'))] }));
			assert.equal(planted.status, 200, planted.text);
			const answer = await sign(base, asOutsider(), { pageId: OTHER_PAGE, paths: [victimPath('a')] });
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body.signed, {});
		});
	});

	it('listing the victim as a collaborator of a new page does not open their media either', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base) => {
			const created = await send(base, '/api/pages', asOutsider(), post({
				id: PLANTED_PAGE, workspaceId: OTHER_WORKSPACE, title: 'Plant', visibility: 'shared',
				collaborators: [{ userId: IDS.userA, role: 'viewer' }], content: [imageBlock('p2', victimPath('b'))],
			}));
			if (created.status >= 300) return; // refused outright: nothing was planted
			const answer = await sign(base, asOutsider(), { pageId: PLANTED_PAGE, paths: [victimPath('b')] });
			assert.deepEqual(answer.body.signed, {});
		});
	});
});

describe('a teammate on a shared page still gets the images signed', () => {
	it('B, a viewer of the team workspace, gets A\'s image on A\'s shared page', async () => {
		const world = membershipWorld();
		world.osionos_pages.find((page) => page.id === IDS.sharedA).content = [imageBlock('s1', victimPath('c'))];
		await inMembershipWorld(world, {}, async (base) => {
			const answer = await sign(base, asB(), { pageId: IDS.sharedA, paths: [victimPath('c')] });
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(Object.keys(answer.body.signed), [victimPath('c')]);
		});
	});

	it('A gets a member\'s image on A\'s own page, in one membership read', async () => {
		const world = membershipWorld();
		world.osionos_pages.find((page) => page.id === IDS.sharedA).content = [imageBlock('s2', memberPath)];
		await inMembershipWorld(world, {}, async (base, mock) => {
			const answer = await sign(base, asA(), { pageId: IDS.sharedA, paths: [memberPath] });
			assert.deepEqual(Object.keys(answer.body.signed), [memberPath]);
			assert.equal(membershipReads(mock).length, 1);
		});
	});

	it('the workspace owner with no member row counts as a member (G4)', async () => {
		const world = membershipWorld();
		world.osionos_workspaces.find((workspace) => workspace.id === IDS.team).owner_id = WORKSPACE_OWNER;
		world.osionos_pages.find((page) => page.id === IDS.sharedA).content = [imageBlock('s4', ownerPath)];
		await inMembershipWorld(world, {}, async (base) => {
			const answer = await sign(base, asA(), { pageId: IDS.sharedA, paths: [ownerPath] });
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(Object.keys(answer.body.signed), [ownerPath]);
		});
	});

	it('a membership read that fails signs nothing foreign', async () => {
		const world = membershipWorld();
		world.osionos_pages.find((page) => page.id === IDS.sharedA).content = [imageBlock('s3', memberPath)];
		const failWhen = (call) => (call.table === 'osionos_workspace_members' && String(call.params.get('user_id')).startsWith('in.')
			? { status: 500, body: { message: 'down' } } : null);
		await inMembershipWorld(world, { failWhen }, async (base) => {
			const answer = await sign(base, asA(), { pageId: IDS.sharedA, paths: [memberPath] });
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body.signed, {});
		});
	});
});
