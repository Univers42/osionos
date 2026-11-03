/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-node-install.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Tests for osionos-node install and self-update:
// Verifies that install.sh creates ~/.local/bin/osionos even when run without arguments,
// that osionos launcher supports opening folders and updating, and that updating an
// already-configured node restarts the background service.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/osionos-node');
const installScript = join(packageDir, 'install.sh');
const cliScript = join(packageDir, 'cli.mjs');
const serverPin = JSON.parse(readFileSync(join(packageDir, 'server-pin.json'), 'utf8'));

function createMockEnvironment() {
	const base = mkdtempSync(join(tmpdir(), 'osio-node-test-'));
	const home = join(base, 'home');
	const data = join(base, 'data');
	const mockSrc = join(base, 'src');
	const mockBin = join(base, 'bin');

	mkdirSync(home, { recursive: true });
	mkdirSync(data, { recursive: true });
	mkdirSync(mockBin, { recursive: true });

	// Mock VS Code server so installer doesn't try downloading
	const vscodeVer = serverPin.server.vscode;
	const serverLib = join(data, 'server', vscodeVer);
	mkdirSync(serverLib, { recursive: true });
	const fakeNode = join(serverLib, 'node');
	writeFileSync(fakeNode, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

	// Mock checkout with built pages
	mkdirSync(join(mockSrc, 'packages', 'osionos-node'), { recursive: true });
	mkdirSync(join(mockSrc, 'dist-ide'), { recursive: true });
	mkdirSync(join(mockSrc, 'build', 'terminal'), { recursive: true });
	mkdirSync(join(mockSrc, 'build', 'editor'), { recursive: true });
	writeFileSync(join(mockSrc, 'dist-ide', 'index.html'), '<html/>');
	writeFileSync(join(mockSrc, 'build', 'terminal', 'index.html'), '<html/>');
	writeFileSync(join(mockSrc, 'build', 'editor', 'index.html'), '<html/>');
	writeFileSync(join(mockSrc, 'packages', 'osionos-node', 'server-pin.json'), JSON.stringify(serverPin));
	writeFileSync(join(mockSrc, 'packages', 'osionos-node', 'cli.mjs'), '#!/usr/bin/env node\n');

	return {
		base,
		home,
		data,
		mockSrc,
		mockBin,
		cleanup: () => rmSync(base, { recursive: true, force: true }),
	};
}

test('install.sh without arguments installs ~/.local/bin/osionos with executable permissions', () => {
	const env = createMockEnvironment();
	try {
		const res = spawnSync('/bin/sh', [installScript], {
			env: {
				...process.env,
				HOME: env.home,
				OSIONOS_SRC: env.mockSrc,
				OSIONOS_DATA: env.data,
			},
			encoding: 'utf8',
		});

		assert.equal(res.status, 0, `install.sh failed: ${res.stderr}\n${res.stdout}`);
		const launcherPath = join(env.home, '.local', 'bin', 'osionos');
		assert.equal(existsSync(launcherPath), true, 'launcher must exist in ~/.local/bin/osionos');
		const st = statSync(launcherPath);
		assert.equal((st.mode & 0o111) !== 0, true, 'launcher must be executable');

		const content = readFileSync(launcherPath, 'utf8');
		assert.match(content, /open/, 'launcher must support open');
		assert.match(content, /update/, 'launcher must support update');
	} finally {
		env.cleanup();
	}
});

test('cli.mjs USAGE and commands include update', () => {
	const res = spawnSync(process.execPath, [cliScript], { encoding: 'utf8' });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /osionos-node update/);
});

test('the installed osionos launcher delegates to open and update', () => {
	const env = createMockEnvironment();
	try {
		// Create a stub cli.mjs that records arguments received
		const logFile = join(env.base, 'call.log');
		const stubCli = [
			'#!/usr/bin/env node',
			'import { appendFileSync } from "node:fs";',
			`appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
		].join('\n');
		writeFileSync(join(env.mockSrc, 'packages', 'osionos-node', 'cli.mjs'), stubCli);

		spawnSync('/bin/sh', [installScript], {
			env: {
				...process.env,
				HOME: env.home,
				OSIONOS_SRC: env.mockSrc,
				OSIONOS_DATA: env.data,
			},
		});

		const launcherPath = join(env.home, '.local', 'bin', 'osionos');
		assert.equal(existsSync(launcherPath), true);

		// Test opening a folder
		const openRes = spawnSync(launcherPath, ['my-folder'], {
			env: { ...process.env, HOME: env.home },
			encoding: 'utf8',
		});
		assert.equal(openRes.status, 0, `launcher open failed: ${openRes.stderr}`);

		// Test update
		const updateRes = spawnSync(launcherPath, ['update'], {
			env: { ...process.env, HOME: env.home },
			encoding: 'utf8',
		});
		assert.equal(updateRes.status, 0, `launcher update failed: ${updateRes.stderr}`);

		const calls = readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
		assert.deepEqual(calls[0], ['open', 'my-folder']);
		assert.deepEqual(calls[1], ['update']);
	} finally {
		env.cleanup();
	}
});

test('install.sh on an already-configured node restarts the service when updating without args', () => {
	const env = createMockEnvironment();
	try {
		// Mock start.sh to simulate an existing configured node
		const osionosHome = join(env.home, '.osionos');
		mkdirSync(osionosHome, { recursive: true });
		const startSh = join(osionosHome, 'start.sh');
		writeFileSync(startSh, '#!/bin/sh\nexit 0\n', { mode: 0o700 });

		// Mock systemctl
		const sysLog = join(env.base, 'systemctl.log');
		const fakeSystemctl = join(env.mockBin, 'systemctl');
		writeFileSync(fakeSystemctl, `#!/bin/sh\necho "$*" >> ${JSON.stringify(sysLog)}\nexit 0\n`, { mode: 0o755 });

		const res = spawnSync('/bin/sh', [installScript], {
			env: {
				...process.env,
				PATH: `${env.mockBin}:${process.env.PATH}`,
				HOME: env.home,
				OSIONOS_SRC: env.mockSrc,
				OSIONOS_DATA: env.data,
			},
			encoding: 'utf8',
		});

		assert.equal(res.status, 0, `install.sh failed: ${res.stderr}\n${res.stdout}`);
		assert.equal(existsSync(sysLog), true, 'systemctl must have been invoked');
		const logs = readFileSync(sysLog, 'utf8');
		assert.match(logs, /--user restart osionos-node\.service/, 'must restart osionos-node.service');
	} finally {
		env.cleanup();
	}
});
