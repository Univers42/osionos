/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   server-launch.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Starts a machine's VS Code server in socket mode (devil verdict 2026-10-30, A1-A7): it listens
// on a Unix socket inside a 0700 directory with no connection token, so the directory's owner is
// the only one who can reach it and no TCP port ever opens. Its terminals get the owner's login
// shell and umask, as if the owner had opened them.
import { spawn } from 'node:child_process';
import { lstatSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

// Linux allows 108 bytes and macOS 104; 100 leaves room for both.
const MAX_SOCKET_PATH = 100;

export function prepareSocketDir(dir) {
	if (Buffer.byteLength(join(dir, 'reh.sock')) > MAX_SOCKET_PATH) throw new Error(`socket path over 100 bytes: ${dir}`);
	// An explicit mode plus chmod, never a process umask: the server's own children keep the
	// owner's umask (A2).
	try {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	} catch (error) {
		if (error.code !== 'EEXIST') throw error;
	}
	const stat = lstatSync(dir);
	if (stat.isSymbolicLink()) throw new Error(`socket directory is a symlink: ${dir}`);
	if (!stat.isDirectory()) throw new Error(`socket directory is not a directory: ${dir}`);
	if (stat.uid !== process.getuid()) throw new Error(`socket directory belongs to uid ${stat.uid}: ${dir}`);
	if ((stat.mode & 0o077) !== 0) {
		throw new Error(`socket directory must be 0700, is ${(stat.mode & 0o777).toString(8)}: ${dir}`);
	}
	return dir;
}

export function serverArgv({ serverDir, socketPath, dataDir }) {
	return [
		join(serverDir, 'vscode', 'out', 'server-main.js'),
		'--socket-path', socketPath, '--without-connection-token', '--accept-server-license-terms',
		'--server-data-dir', dataDir, '--telemetry-level', 'off',
	];
}

// The server reads VSCODE_SERVER_HOST/PORT as defaults, which would add a TCP listener (A3).
export function serverEnv(baseEnv, loginShell) {
	const env = { ...baseEnv, SHELL: loginShell };
	delete env.VSCODE_SERVER_HOST;
	delete env.VSCODE_SERVER_PORT;
	return env;
}

// A child killed by a signal keeps exitCode null and sets signalCode instead.
const hasExited = (child) => child.exitCode !== null || child.signalCode !== null;

function probe(socketPath) {
	return new Promise((resolve) => {
		const socket = connect(socketPath);
		socket.once('connect', () => { socket.destroy(); resolve('live'); });
		socket.once('error', (error) => resolve(error.code === 'ECONNREFUSED' ? 'dead' : 'absent'));
	});
}

// Caveat: readiness is "the socket accepts a connection" within readyTimeoutMs; a machine slower
// than that reports a timeout although the server would have come up.
async function waitForSocket(socketPath, readyTimeoutMs, child) {
	const deadline = Date.now() + readyTimeoutMs;
	while (Date.now() < deadline) {
		if (hasExited(child)) throw new Error(`VS Code server exited (${child.exitCode ?? child.signalCode}) before listening`);
		if (await probe(socketPath) === 'live') return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	child.kill();
	throw new Error(`VS Code server did not listen on ${socketPath} within ${readyTimeoutMs} ms`);
}

function writeMachineSettings(dataDir) {
	const machineDir = join(dataDir, 'data', 'Machine');
	mkdirSync(machineDir, { recursive: true });
	// Extensions change only when the owner asks (C22).
	writeFileSync(join(machineDir, 'settings.json'), JSON.stringify({ 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false }, null, 2));
}

export async function ensureServer({ nodeBin, entry, serverDir, socketDir, dataDir, loginShell, baseEnv = process.env, readyTimeoutMs = 20_000 }) {
	const dir = prepareSocketDir(socketDir);
	const socketPath = join(dir, 'reh.sock');
	let existing = null;
	try { existing = lstatSync(socketPath); } catch { /* nothing there */ }
	if (existing && !existing.isSocket()) throw new Error(`refusing to replace ${socketPath}: not a socket`);
	if (existing) {
		const state = await probe(socketPath);
		if (state === 'live') return { socketPath, reused: true, stop: async () => {} };
		unlinkSync(socketPath);
	}
	writeMachineSettings(dataDir);
	const argv = entry ? [entry, ...serverArgv({ serverDir: '/', socketPath, dataDir }).slice(1)] : serverArgv({ serverDir, socketPath, dataDir });
	const child = spawn(nodeBin, argv, { env: serverEnv(baseEnv, loginShell), stdio: ['ignore', 'ignore', 'inherit'] });
	await waitForSocket(socketPath, readyTimeoutMs, child);
	const stop = () => new Promise((resolve) => {
		if (hasExited(child)) return resolve();
		child.once('exit', () => resolve());
		child.kill();
	});
	return { socketPath, reused: false, pid: child.pid, stop };
}

