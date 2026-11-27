// The editor's disk opens like a remembered shell (devil verdict 2026-11-27, connector trusted
// browser, TB1-TB3, TB8, TB9): one remembered-computers store and one jti guard for /api/pty and
// /api/fs, a session secret bound to the app origin it opened under, and a closing touch that never
// writes the file back after a removal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { readFsAuth } from '../../packages/osionos-node/fs-wire.mjs';
import { settle } from './support/pty-fakes.mjs';
import { FakeConn } from './support/pty-fakes.mjs';
import { MACHINE, OWNER, STRANGER, mint, mintResume, open, world } from './support/pty-world.mjs';

const PROD = 'https://baas.tail10f2ea.ts.net:8443';
const BETA = 'https://baas-beta.tail10f2ea.ts.net';
const HOUR = 3_600_000;
const DEVICE = 'd'.repeat(43);

async function openFs(origin, credential) {
	const conn = new FakeConn();
	origin.fs.attach(conn);
	conn.receive(JSON.stringify(credential));
	await settle();
	await settle();
	return conn;
}

const opened = (conn) => conn.sent.find((message) => message.op === 'opened');
const refused = (conn) => { assert.equal(conn.closeCode, 4401); assert.equal(opened(conn), undefined); };

// A device secret issued the way a person gets one: a step-up token carrying "remember" on a shell.
async function rememberedDevice(base, origin, appOrigin = PROD) {
	const conn = await open(origin, { token: mint(base, { remember: true }), appOrigin });
	return { conn, device: opened(conn).device };
}

test('TB2: the fs opening reads a device beside an assertion and an app origin, and nothing less', () => {
	const assertion = `osionos_mr1.abcdefgh.${'a'.repeat(40)}.${'b'.repeat(40)}`;
	assert.deepEqual(readFsAuth(JSON.stringify({ device: DEVICE, assertion, appOrigin: PROD })), { kind: 'remembered', device: DEVICE, assertion, appOrigin: PROD });
	assert.equal(readFsAuth(JSON.stringify({ device: DEVICE, appOrigin: PROD })), null);
	assert.equal(readFsAuth(JSON.stringify({ assertion, appOrigin: PROD })), null);
	assert.equal(readFsAuth(JSON.stringify({ device: DEVICE, assertion })), null);
	assert.equal(readFsAuth(JSON.stringify({ device: DEVICE, assertion, appOrigin: PROD, extra: 1 })), null);
});

test('TB1: a device secret issued on a shell opens the editor beside a fresh assertion, and the editor can be told one too', async (t) => {
	const { base, origin } = await world(t, { remember: [PROD, BETA], disk: [PROD, BETA] });
	const { device } = await rememberedDevice(base, origin);
	const editor = await openFs(origin, { device, assertion: mintResume(base), appOrigin: PROD });
	assert.equal(editor.closeCode, null);
	assert.match(opened(editor).secret, /^[A-Za-z0-9_-]{43}$/);
	assert.equal(opened(editor).device, undefined, 'a remembered opening is never told a device secret');

	const stepped = await openFs(origin, { token: mint(base, { remember: true }), appOrigin: PROD });
	assert.match(opened(stepped).device, /^[A-Za-z0-9_-]{43}$/);
	const plain = await openFs(origin, { token: mint(base), appOrigin: PROD });
	assert.equal(opened(plain).device, undefined, 'no remember choice, no device secret');
});

test('TB1: an assertion spent on a shell is refused by the editor, and one spent by the editor is refused by a shell', async (t) => {
	const { base, origin } = await world(t, { remember: [PROD], disk: [PROD] });
	const { device } = await rememberedDevice(base, origin);
	const first = mintResume(base);
	const shell = await open(origin, { device, assertion: first, appOrigin: PROD });
	assert.ok(opened(shell));
	refused(await openFs(origin, { device, assertion: first, appOrigin: PROD }));

	const second = mintResume(base);
	assert.ok(opened(await openFs(origin, { device, assertion: second, appOrigin: PROD })));
	const again = await open(origin, { device, assertion: second, appOrigin: PROD });
	assert.equal(again.closeCode, 4401);
});

test('TB2: device alone, assertion alone, a replay, another owner, another machine, a production device under the beta: 4401, no roots', async (t) => {
	const { base, origin } = await world(t, { remember: [PROD, BETA], disk: [PROD, BETA] });
	const { device } = await rememberedDevice(base, origin);
	const replayed = mintResume(base);
	assert.ok(opened(await openFs(origin, { device, assertion: replayed, appOrigin: PROD })));
	const cases = [
		{ device, appOrigin: PROD },
		{ assertion: mintResume(base), appOrigin: PROD },
		{ device, assertion: replayed, appOrigin: PROD },
		{ device, assertion: mintResume(base, { sub: STRANGER }), appOrigin: PROD },
		{ device, assertion: mintResume(base, { machine: 'x'.repeat(MACHINE.length) }), appOrigin: PROD },
		{ device, assertion: mintResume(base), appOrigin: BETA },
	];
	for (const credential of cases) {
		const conn = await openFs(origin, credential);
		refused(conn);
		assert.equal(conn.sent.some((message) => message.op === 'roots'), false);
	}
});

test('TB3: a session secret opens only under the app origin its session opened under', async (t) => {
	const { base, origin } = await world(t, { remember: [PROD, BETA], disk: [PROD, BETA] });
	const first = await openFs(origin, { token: mint(base), appOrigin: PROD });
	const { secret } = opened(first);
	refused(await openFs(origin, { secret, appOrigin: BETA }));
	assert.ok(opened(await openFs(origin, { secret, appOrigin: PROD })));

	const { device } = await rememberedDevice(base, origin);
	const remembered = await openFs(origin, { device, assertion: mintResume(base), appOrigin: PROD });
	refused(await openFs(origin, { secret: opened(remembered).secret, appOrigin: BETA }));
});

test('TB8: the last socket of a remembered session closing slides its idle window', async (t) => {
	const clock = { at: 1_800_000_000_000 };
	const { base, origin } = await world(t, { remember: [PROD], disk: [PROD], now: () => clock.at });
	const { conn, device } = await rememberedDevice(base, origin);
	clock.at += 11 * HOUR;
	conn.drop();
	await settle();
	clock.at += 11 * HOUR;
	assert.ok(opened(await openFs(origin, { device, assertion: mintResume(base), appOrigin: PROD })), 'touched at the close: 11 h idle, not 22 h');
});

test('TB9: a removal with a remembered shell and an open editor leaves no remembered file behind', async (t) => {
	const { base, origin, file } = await world(t, { remember: [PROD], disk: [PROD] });
	const { device } = await rememberedDevice(base, origin);
	const editor = await openFs(origin, { device, assertion: mintResume(base), appOrigin: PROD });
	const shell = await open(origin, { device, assertion: mintResume(base), appOrigin: PROD });
	assert.ok(opened(editor) && opened(shell));
	assert.equal(existsSync(file), true);
	origin.revoke(OWNER);
	await settle();
	await settle();
	assert.equal(existsSync(file), false, existsSync(file) ? readFileSync(file, 'utf8').length : 'gone');
	assert.equal(editor.closeCode, 1001);
});
