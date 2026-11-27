// `osionos-node status` only reads, and prints nothing a person should not paste (devil verdict
// 2026-11-27, TB22-TB24): canaries planted in every file it reads never reach its output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { saveMachine } from '../../packages/osionos-node/machine-identity.mjs';
import { readStatus } from '../../packages/osionos-node/status.mjs';
import { MACHINE, OWNER } from './support/paired-node.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'osionos-node', 'cli.mjs');
const APP = 'https://app.example';
const KEY_CANARY = 'CANARYprivateKEYzz1';
const HASH_CANARY = 'deadbeef'.repeat(8);
const START_CANARY = 'CANARYstartLINEzz3';
const CANARIES = [KEY_CANARY, HASH_CANARY, START_CANARY, 'dylan@'];
const NOW = 1_800_000_000_000;

function plantedHome(t, { corrupt = false } = {}) {
	const home = mkdtempSync(join(tmpdir(), 'node-status-'));
	t.after(() => rmSync(home, { recursive: true, force: true }));
	const dir = join(home, '.osionos');
	mkdirSync(dir, { mode: 0o700 });
	const machineFile = join(dir, 'machine.json');
	if (corrupt) writeFileSync(machineFile, `{"machineId":"${MACHINE}","privateKey":"${KEY_CANARY}`, { mode: 0o600 });
	else saveMachine(machineFile, { machineId: MACHINE, ownerId: OWNER, accountEmail: 'dylan@gmail.com', bridgeUrl: 'https://bridge.example', bridgeKeys: { kid1: 'pub' }, privateKey: KEY_CANARY });
	const record = { hash: HASH_CANARY, owner: OWNER, machine: MACHINE, appOrigin: APP, createdAt: NOW - 2 * 86_400_000, lastUsedAt: NOW - 3 * 3_600_000 };
	writeFileSync(join(dir, 'remembered-computers.json'), JSON.stringify({ computers: [record] }), { mode: 0o600 });
	writeFileSync(join(dir, 'start.sh'), `#!/bin/sh\nexec /usr/bin/node /x/cli.mjs connect '--bridge' 'https://bridge.example' '--app-origin' '${APP}' '--remember-origin' '${APP}' '--name' '${START_CANARY}' '--app-origin' '${START_CANARY}'\n`, { mode: 0o700 });
	writeFileSync(join(dir, 'machine.removed-2026-11-27T00-00-00-000Z.json'), `{"privateKey":"${KEY_CANARY}"}`, { mode: 0o600 });
	return home;
}

const snapshot = (dir) => readdirSync(dir).sort().map((name) => [name, readFileSync(join(dir, name), 'utf8'), statSync(join(dir, name)).mtimeMs]);
const thisMachine = async () => ({ ok: true, json: async () => ({ paired: true, machineId: MACHINE }) });

test('TB23: status reports pairing, service, origins and remembered ages, and writes nothing', async (t) => {
	const home = plantedHome(t);
	const before = snapshot(join(home, '.osionos'));
	const out = await readStatus({ home, fetchImpl: thisMachine, at: NOW });
	assert.deepEqual(snapshot(join(home, '.osionos')), before);
	assert.match(out, new RegExp(`paired +yes, machine ${MACHINE}, account d•••@g•••\\.com`));
	assert.match(out, /service +running on http:\/\/127\.0\.0\.1:4100/);
	assert.match(out, /app origins +https:\/\/app\.example\n/);
	assert.match(out, /remembers +https:\/\/app\.example\n/);
	assert.match(out, /1 origin value\(s\) in start\.sh are not origins/);
	assert.match(out, /remembered +1 computer\(s\)\n +https:\/\/app\.example: used 3 h ago, 2 d old/);
	assert.match(out, /removed +1 archived identity file/);
	for (const canary of CANARIES) assert.equal(out.includes(canary), false, `no ${canary}`);
});

test('TB23: another program on the port is told apart from this node', async (t) => {
	const out = await readStatus({ home: plantedHome(t), at: NOW, fetchImpl: async () => ({ ok: true, json: async () => ({ machineId: 'm-zzzzzzzzzzzzzzzz' }) }) });
	assert.match(out, /service +not this machine: another program answers/);
	const down = await readStatus({ home: plantedHome(t), at: NOW, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
	assert.match(down, /service +not running/);
});

test('TB24: a machine.json corrupted at the key prints "unreadable" and no canary, on stdout or stderr', async (t) => {
	for (const corrupt of [false, true]) {
		const home = plantedHome(t, { corrupt });
		chmodSync(join(home, '.osionos'), 0o700);
		const { stdout, stderr, code } = await new Promise((resolve) => {
			execFile(process.execPath, [CLI, 'status'], { env: { PATH: process.env.PATH, HOME: home }, timeout: 20_000 },
				(error, out, err) => resolve({ stdout: out, stderr: err, code: error ? error.code : 0 }));
		});
		assert.equal(code, 0);
		if (corrupt) assert.match(stdout, /paired +machine\.json is unreadable/);
		for (const canary of CANARIES) {
			assert.equal(stdout.includes(canary), false, `stdout carries ${canary}`);
			assert.equal(stderr.includes(canary), false, `stderr carries ${canary}`);
		}
	}
});
