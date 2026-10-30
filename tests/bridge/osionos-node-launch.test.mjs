/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-node-launch.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// How osionos-node starts a machine's VS Code server (devil verdict 2026-10-30, socket mode
// A1-A7): a Unix socket in a 0700 directory and no token, no TCP listener, the owner's own
// shell and umask, and a stale socket handled without ever touching anything else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureServer, prepareSocketDir, serverArgv, serverEnv } from '../../packages/osionos-node/server-launch.mjs';

const FAKE = new URL('./fixtures/fake-reh-server.mjs', import.meta.url).pathname;

function scratch(t) {
	// Short root: a socket path must stay under 100 bytes (A1).
	const dir = mkdtempSync(join(tmpdir(), 'on-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

test('the socket directory is created 0700 and checked, whatever the umask (A1, A2)', (t) => {
	const root = scratch(t);
	const before = process.umask(0o022);
	try {
		const dir = prepareSocketDir(join(root, 'run'));
		const stat = lstatSync(dir);
		assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
		assert.equal(stat.mode & 0o777, 0o700);
		assert.equal(stat.uid, process.getuid());
	} finally {
		process.umask(before);
	}
});

test('a directory that is shared, a symlink, or too deep for a socket is refused (A1)', (t) => {
	const root = scratch(t);
	mkdirSync(join(root, 'open'), { mode: 0o755 });
	chmodSync(join(root, 'open'), 0o755);
	assert.throws(() => prepareSocketDir(join(root, 'open')), /0700/);
	mkdirSync(join(root, 'real'), { mode: 0o700 });
	symlinkSync(join(root, 'real'), join(root, 'link'));
	assert.throws(() => prepareSocketDir(join(root, 'link')), /symlink/);
	assert.throws(() => prepareSocketDir(join(root, 'x'.repeat(120))), /100 bytes/);
});

test('the server command line has a socket, no token, no host or port, telemetry off (A3)', () => {
	const argv = serverArgv({ serverDir: '/srv/reh', socketPath: '/run/u/reh.sock', dataDir: '/home/u/.osionos/server-data' });
	assert.equal(argv[0], '/srv/reh/vscode/out/server-main.js');
	assert.deepEqual(argv.slice(1), [
		'--socket-path', '/run/u/reh.sock', '--without-connection-token', '--accept-server-license-terms',
		'--server-data-dir', '/home/u/.osionos/server-data', '--telemetry-level', 'off',
	]);
	assert.ok(!argv.some((arg) => /^--(host|port|connection-token)/.test(arg)));
});

test('the server env drops host/port defaults and carries the login shell (A3)', () => {
	const env = serverEnv({ PATH: '/usr/bin', VSCODE_SERVER_HOST: '0.0.0.0', VSCODE_SERVER_PORT: '80', SHELL: '/bin/sh' }, '/usr/bin/hellish');
	assert.equal(env.VSCODE_SERVER_HOST, undefined);
	assert.equal(env.VSCODE_SERVER_PORT, undefined);
	assert.equal(env.SHELL, '/usr/bin/hellish');
	assert.equal(env.PATH, '/usr/bin');
});

const launch = (root) => ensureServer({
	nodeBin: process.execPath, entry: FAKE, socketDir: join(root, 'run'), dataDir: join(root, 'data'),
	loginShell: '/usr/bin/hellish', baseEnv: { ...process.env, VSCODE_SERVER_PORT: '9' }, readyTimeoutMs: 5000,
});

test('a fresh start listens on the socket only, as the owner, with the owner umask (A2, A3)', async (t) => {
	const root = scratch(t);
	const ownerUmask = process.umask();
	const server = await launch(root);
	t.after(() => server.stop());
	assert.equal(server.reused, false);
	assert.ok(lstatSync(server.socketPath).isSocket());
	const started = JSON.parse(readFileSync(`${server.socketPath}.started.json`, 'utf8'));
	assert.equal(started.shell, '/usr/bin/hellish');
	assert.equal(started.port, null);
	assert.equal(started.umask, ownerUmask);
	assert.ok(started.argv.includes('--without-connection-token'));
	const settings = JSON.parse(readFileSync(join(root, 'data', 'data', 'Machine', 'settings.json'), 'utf8'));
	assert.equal(settings['extensions.autoUpdate'], false);
});

// A crash leaves the socket file behind with nobody listening: a SIGKILLed listener does that.
async function staleSocket(socketPath) {
	const child = spawn(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(socketPath)}, () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] });
	await new Promise((resolve) => child.stdout.once('data', resolve));
	child.kill('SIGKILL');
	await new Promise((resolve) => child.once('exit', resolve));
	assert.ok(lstatSync(socketPath).isSocket(), 'the killed listener left its socket file');
}

test('a live socket is reused, a dead one is replaced, anything else is refused (A7)', async (t) => {
	const root = scratch(t);
	const run = prepareSocketDir(join(root, 'run'));
	const socketPath = join(run, 'reh.sock');
	const live = createServer((s) => s.end()).listen(socketPath);
	await new Promise((resolve) => live.once('listening', resolve));
	const reused = await launch(root);
	assert.equal(reused.reused, true);
	await new Promise((resolve) => live.close(resolve));

	await staleSocket(socketPath);
	const replaced = await launch(root);
	t.after(() => replaced.stop());
	assert.equal(replaced.reused, false);
	assert.ok(existsSync(`${replaced.socketPath}.started.json`));
	await replaced.stop();

	rmSync(socketPath, { force: true });
	writeFileSync(socketPath, 'not a socket');
	await assert.rejects(launch(root), /not a socket/);
	assert.equal(readFileSync(socketPath, 'utf8'), 'not a socket', 'the stray file is left in place');
});
