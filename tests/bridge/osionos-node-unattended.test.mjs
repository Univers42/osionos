// A connector the service manager restarts never pairs on its own (devil verdict 2026-11-27, TB16),
// and an unreadable identity file never leaks its text into a log (TB22).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMachine } from '../../packages/osionos-node/machine-identity.mjs';

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'osionos-node');
const CANARY = 'CANARYkeyFRAGMENTzz9';

function nodeHome(t) {
	const home = mkdtempSync(join(tmpdir(), 'node-unattended-'));
	t.after(() => rmSync(home, { recursive: true, force: true }));
	mkdirSync(join(home, '.osionos'), { mode: 0o700 });
	return home;
}

test('TB22: a machine.json corrupted at the key is "unreadable", with none of its text', (t) => {
	const file = join(nodeHome(t), '.osionos', 'machine.json');
	writeFileSync(file, `{"machineId":"m-abcdefghijklmnop","privateKey":"${CANARY}`, { mode: 0o600 });
	assert.throws(() => loadMachine(file), (error) => error.message.includes('machine.json is unreadable') && !error.message.includes(CANARY));
	writeFileSync(file, `{"privateKey":"${CANARY}"}`, { mode: 0o600 });
	chmodSync(file, 0o600);
	assert.throws(() => loadMachine(file), (error) => error.message.includes('machine.json is unreadable') && !error.message.includes(CANARY));
});

test('TB16: connect with no machine.json and no terminal exits 0 and never calls the bridge', async (t) => {
	const home = nodeHome(t);
	let calls = 0;
	const bridge = http.createServer((req, res) => { calls += 1; res.writeHead(503).end(); });
	await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
	t.after(() => bridge.close());
	const url = `http://127.0.0.1:${bridge.address().port}`;
	const { code, stdout } = await new Promise((resolve) => {
		const child = execFile(process.execPath, [join(PACKAGE, 'cli.mjs'), 'connect', '--bridge', url, '--app-origin', 'https://app.example'], {
			env: { PATH: process.env.PATH, HOME: home }, timeout: 20_000,
		}, (error, out) => resolve({ code: error ? error.code : 0, stdout: out }));
		child.stdin.end();
	});
	assert.equal(code, 0);
	assert.match(stdout, /not paired: run the install line/);
	assert.equal(calls, 0);
});

test('TB16: the launchd plist restarts only a failure, never a clean exit', () => {
	const install = readFileSync(join(PACKAGE, 'install.sh'), 'utf8');
	assert.match(install, /<key>KeepAlive<\/key><dict><key>SuccessfulExit<\/key><false\/><\/dict>/);
	assert.doesNotMatch(install, /<key>KeepAlive<\/key><true\/>/);
	assert.match(install, /^Restart=on-failure$/m);
});
