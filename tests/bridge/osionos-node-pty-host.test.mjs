// The node's pty host (devil verdict 2026-11-01, W7-W9): a child process under the pinned server's
// own node, holding node-pty from that server. The node never loads node-pty itself, so neither an
// ABI mismatch nor a native crash in node-pty can take the node down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHostSessions } from '../../packages/osionos-node/pty-host.mjs';
import { createPtyHost, ptyHostCommand } from '../../packages/osionos-node/pty-runtime.mjs';
import { PTY_LIMITS } from '../../packages/osionos-node/pty-wire.mjs';

function fakePty(pid = 4242) {
	const pty = {
		pid, writes: [], resizes: [], paused: 0, resumed: 0, kills: 0,
		write(data) { pty.writes.push(data); }, resize(cols, rows) { pty.resizes.push([cols, rows]); },
		pause() { pty.paused += 1; }, resume() { pty.resumed += 1; }, kill() { pty.kills += 1; },
		onData(cb) { pty.emitData = cb; }, onExit(cb) { pty.emitExit = cb; },
	};
	return pty;
}

function sessions(env = { SHELL: '/bin/zsh', HOME: '/home/owner', PATH: '/usr/bin' }) {
	const sent = [];
	const spawns = [];
	const groups = [];
	const ptys = [];
	const host = createHostSessions({
		spawn: (file, args, options) => { spawns.push({ file, args, options }); const pty = fakePty(5000 + ptys.length); ptys.push(pty); return pty; },
		send: (message) => sent.push(message), env, cwd: '/home/owner', killGroup: (pid) => groups.push(pid),
	});
	return { host, sent, spawns, groups, ptys };
}

test('W7: the shell is $SHELL in the home folder with the server env; only the size comes from the wire', () => {
	const { host, sent, spawns } = sessions();
	host.handle({ op: 'spawn', id: 1, cols: 80, rows: 24 });
	assert.deepEqual(sent, [{ op: 'spawned', id: 1 }]);
	const [{ file, args, options }] = spawns;
	assert.deepEqual([file, args, options.cwd, options.cols, options.rows], ['/bin/zsh', [], '/home/owner', 80, 24]);
	assert.equal(options.env.PATH, '/usr/bin');
	assert.equal(options.env.TERM, 'xterm-256color');
	const bare = sessions({ HOME: '/home/owner' });
	bare.host.handle({ op: 'spawn', id: 1, cols: 80, rows: 24 });
	assert.equal(bare.spawns[0].file, '/bin/sh', 'no $SHELL falls back to /bin/sh');
});

test('W7: the pty host runs under the server\'s own node whatever ABI this node has', () => {
	const command = ptyHostCommand('/srv/vscode-server/1.138.0');
	assert.equal(command.execPath, '/srv/vscode-server/1.138.0/node');
	assert.match(command.script, /packages\/osionos-node\/pty-host\.mjs$/);
	assert.deepEqual(command.args, ['/srv/vscode-server/1.138.0']);
	assert.ok(!Object.hasOwn(command, 'abi'), 'no choice depends on process.versions.modules');
});

test('W8: kill hangs up the shell\'s process group and the pty, once; a dead id is ignored', () => {
	const { host, groups, ptys, sent } = sessions();
	host.handle({ op: 'spawn', id: 1, cols: 80, rows: 24 });
	host.handle({ op: 'kill', id: 1 });
	host.handle({ op: 'kill', id: 1 });
	assert.deepEqual(groups, [5000]);
	assert.equal(ptys[0].kills, 1);
	ptys[0].emitExit({ exitCode: 0 });
	assert.deepEqual(sent, [{ op: 'spawned', id: 1 }], 'a killed shell reports no exit');
	assert.doesNotThrow(() => host.handle({ op: 'write', id: 1, data: 'x' }));
	assert.equal(host.size(), 0);
});

test('W9: output pauses the pty above the high watermark and resumes below the low one', () => {
	const { host, ptys, sent } = sessions();
	host.handle({ op: 'spawn', id: 1, cols: 80, rows: 24 });
	const [pty] = ptys;
	const chunk = 'y\n'.repeat(8192);
	let delivered = 0;
	while (pty.paused === 0) { pty.emitData(chunk); delivered += chunk.length; }
	assert.ok(delivered > PTY_LIMITS.highWatermark && delivered <= PTY_LIMITS.highWatermark + chunk.length);
	host.handle({ op: 'ack', id: 1, chars: delivered - PTY_LIMITS.lowWatermark });
	assert.equal(pty.resumed, 0, 'at the low watermark it stays paused');
	host.handle({ op: 'ack', id: 1, chars: 1 });
	assert.equal(pty.resumed, 1);
	assert.equal(sent.filter((m) => m.op === 'data').length, delivered / chunk.length);
});

test('W5 in the host: a write or resize after exit is dropped, and a throwing pty never escapes', () => {
	const { host, ptys, sent } = sessions();
	host.handle({ op: 'spawn', id: 1, cols: 80, rows: 24 });
	ptys[0].write = () => { throw new Error('EIO'); };
	assert.doesNotThrow(() => host.handle({ op: 'write', id: 1, data: 'x' }));
	ptys[0].emitExit({ exitCode: 7 });
	assert.deepEqual(sent.at(-1), { op: 'exit', id: 1, exitCode: 7 });
	assert.doesNotThrow(() => host.handle({ op: 'resize', id: 1, cols: 10, rows: 10 }));
	assert.doesNotThrow(() => host.handle({ op: 'nonsense' }));
});

test('W7: a server without node-pty fails closed: no shell, and the node stays up', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'ph-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	mkdirSync(join(dir, 'vscode'));
	symlinkSync(process.execPath, join(dir, 'node'));
	const host = createPtyHost({ serverDir: dir, env: { HOME: dir, PATH: process.env.PATH }, cwd: dir });
	t.after(() => host.stop());
	const exits = [];
	const shell = await host.spawn({ cols: 80, rows: 24 }, { data() {}, exit: (code) => exits.push(code) });
	assert.equal(shell, null);
	assert.equal(await host.spawn({ cols: 80, rows: 24 }, { data() {}, exit() {} }), null, 'the next try fails closed too');
});
