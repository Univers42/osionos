// osionos#233 D233-8: an issue screenshot is an uploaded file, so once enforce is on its bare path
// stops opening. The issues GET already authorizes (scope=mine filters on reporter_id, scope=all
// needs an admin), so that answer carries a signed screenshot_url; signPaths gets no issue rule.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createIssuesHandler } from '../../scripts/bridge-issues.mjs';
import { uid, createStub, call } from './support/issues-postgrest.mjs';
import { IDS, post, send } from './support/bridge-harness.mjs';
import { OTHER_PAGE, asOutsider, inMembershipWorld, membershipWorld } from './support/membership-world.mjs';

const SECRET = 'media-url-secret-for-tests-0123456789';
const ENV = { MEDIA_URL_SECRET: SECRET };
const U1 = uid(1);
const U2 = uid(2);
const shot = (owner) => `/api/media/uploads/${owner}/${'a'.repeat(64)}.png`;
const SIGNED = /\?exp=\d+&kid=[0-9a-f]{8}&sig=[0-9a-f]{64}$/;
const issue = (id, reporter, screenshot) => ({ id, reporter_id: reporter, title: 't', status: 'open', created_at: '2026-01-02', screenshot_path: screenshot });

const list = (opts) => call(createIssuesHandler, createStub(opts.world), { method: 'GET', path: '/api/issues', token: 'Bearer t', ...opts });

describe('issue screenshots in the issues GET', () => {
	it('the reporter gets a signed link for their own screenshot', async () => {
		const r = await list({ world: { admin: false, issues: [issue(uid(5), U1, shot(U1))] }, userId: U1, query: '?scope=mine', env: ENV });
		assert.equal(r.status, 200);
		assert.equal(r.body.issues[0].screenshot_path, shot(U1));
		assert.match(r.body.issues[0].screenshot_url, SIGNED);
		assert.ok(r.body.issues[0].screenshot_url.startsWith(shot(U1)));
	});

	it('an admin gets a signed link on scope=all', async () => {
		const r = await list({ world: { admin: true, issues: [issue(uid(5), U1, shot(U1))], profiles: [] }, userId: U2, isAdmin: true, query: '?scope=all', env: ENV });
		assert.equal(r.status, 200);
		assert.match(r.body.issues[0].screenshot_url, SIGNED);
	});

	it('a non-admin cannot list scope=all', async () => {
		const r = await list({ world: { admin: false, issues: [issue(uid(5), U1, shot(U1))] }, userId: U2, query: '?scope=all', env: ENV });
		assert.equal(r.status, 403);
		assert.equal(JSON.stringify(r.body).includes('sig='), false);
	});

	it('a non-reporter listing scope=mine sees no one else\'s screenshot', async () => {
		const r = await list({ world: { admin: false, issues: [issue(uid(5), U1, shot(U1))] }, userId: U2, query: '?scope=mine', env: ENV });
		assert.equal(r.status, 200);
		assert.deepEqual(r.body.issues, []);
	});

	it('no key, no screenshot_url: the answer is unchanged while the secret is unset', async () => {
		const r = await list({ world: { admin: false, issues: [issue(uid(5), U1, shot(U1)), issue(uid(6), U1, null)] }, userId: U1, query: '?scope=mine' });
		assert.equal(r.status, 200);
		assert.equal('screenshot_url' in r.body.issues[0], false);
		assert.equal('screenshot_url' in r.body.issues[1], false);
	});

	it('a row with no screenshot or a non-upload path gets no screenshot_url', async () => {
		const r = await list({ world: { admin: false, issues: [issue(uid(5), U1, null), issue(uid(6), U1, 'https://evil.example/x.png')] }, userId: U1, query: '?scope=mine', env: ENV });
		assert.equal(r.status, 200);
		assert.equal('screenshot_url' in r.body.issues[0], false);
		assert.equal('screenshot_url' in r.body.issues[1], false);
	});
});

describe('the sign route has no issue rule', () => {
	let saved;
	before(() => { saved = process.env.MEDIA_URL_SECRET; process.env.MEDIA_URL_SECRET = SECRET; });
	after(() => { if (saved === undefined) delete process.env.MEDIA_URL_SECRET; else process.env.MEDIA_URL_SECRET = saved; });

	it('a non-reporter cannot sign the reporter\'s screenshot, with or without a pageId', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base) => {
			const reporterShot = shot(IDS.userA);
			const bare = await send(base, '/api/media/uploads/sign', asOutsider(), post({ paths: [reporterShot] }));
			assert.equal(bare.status, 200, bare.text);
			assert.deepEqual(bare.body.signed, {});
			const viaPage = await send(base, '/api/media/uploads/sign', asOutsider(), post({ pageId: OTHER_PAGE, paths: [reporterShot] }));
			assert.deepEqual(viaPage.body.signed ?? {}, {});
		});
	});
});
