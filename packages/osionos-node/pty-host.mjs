/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pty-host.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The web terminal's pty host (devil verdict 2026-11-01, W7-W9; groot ADR 0041): a child of the
// node, run by the pinned VS Code server's own `node` with that server's node-pty, so the native
// module always matches its runtime and a crash here never takes the node down. Its only input is
// the node's IPC channel, whose commands pty-service.mjs already validated (pty-wire.mjs). The
// shell, its argv, cwd and env are fixed here: $SHELL, no argument, $HOME, the server's env.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PTY_LIMITS } from './pty-wire.mjs';

const SHELL_ENV = { TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'osionos' };

// The process groups of session `sid`, read from /proc (field 5 pgrp, 6 session, after the last ')'
// so a command name holding ") " cannot shift them).
// Caveat: Linux only; where /proc is missing this returns just [sid], the shell's own group, and a job
// survives unless the shell forwards the hang-up. A process that called setsid() left the session and
// is not found, by design (nohup/disown are the shell's own way out).
export function sessionGroups(sid, procDir = '/proc') {
	let entries;
	try { entries = readdirSync(procDir); } catch { return [sid]; }
	const groups = new Set([sid]);
	for (const entry of entries) {
		if (!/^\d+$/.test(entry)) continue;
		let stat;
		try { stat = readFileSync(join(procDir, entry, 'stat'), 'utf8'); } catch { continue; }
		const [pgrp, session] = stat.slice(stat.lastIndexOf(')') + 2).split(' ').slice(2, 4).map(Number);
		if (session === sid && pgrp > 0) groups.add(pgrp);
	}
	return [...groups];
}

// A shell is its session's leader, and job control gives every job its own process group, so the
// hang-up goes to each group of the session: hanging up the shell's group alone left `sleep 1000 &`
// running on 3 of 10 closes (issue #316), whenever pty.kill()'s second SIGHUP killed bash before it
// forwarded the first to its jobs. SIGCONT lets a stopped job act on the hang-up, as the kernel does.
function hangUpSession(sid) {
	for (const pgrp of sessionGroups(sid)) {
		try { process.kill(-pgrp, 'SIGHUP'); process.kill(-pgrp, 'SIGCONT'); } catch { /* the group ended */ }
	}
}

export function createHostSessions({ spawn, send, env, cwd, killGroup = hangUpSession }) {
	const shell = env.SHELL || '/bin/sh';
	const live = new Map();

	function open(id, cols, rows) {
		let pty;
		try {
			pty = spawn(shell, [], { name: 'xterm-256color', cols, rows, cwd, env: { ...env, ...SHELL_ENV } });
		} catch {
			return send({ op: 'failed', id });
		}
		const record = { pty, unacked: 0, paused: false };
		live.set(id, record);
		pty.onData((data) => {
			if (live.get(id) !== record) return;
			record.unacked += data.length;
			if (!record.paused && record.unacked > PTY_LIMITS.highWatermark) { record.paused = true; pty.pause(); }
			send({ op: 'data', id, data });
		});
		pty.onExit(({ exitCode }) => {
			if (live.get(id) !== record) return;
			live.delete(id);
			send({ op: 'exit', id, exitCode });
		});
		send({ op: 'spawned', id });
	}

	function kill(id) {
		const record = live.get(id);
		if (!record) return;
		live.delete(id);
		try { killGroup(record.pty.pid); } catch { /* the group already ended */ }
		try { record.pty.kill(); } catch { /* the pty already exited */ }
	}

	function ack(record, chars) {
		record.unacked = Math.max(0, record.unacked - chars);
		if (record.paused && record.unacked < PTY_LIMITS.lowWatermark) { record.paused = false; record.pty.resume(); }
	}

	function handle(message) {
		if (message?.op === 'spawn') return open(message.id, message.cols, message.rows);
		if (message?.op === 'kill') return kill(message.id);
		const record = live.get(message?.id);
		if (!record) return;
		try {
			if (message.op === 'write') record.pty.write(message.data);
			else if (message.op === 'resize') record.pty.resize(message.cols, message.rows);
			else if (message.op === 'ack') ack(record, message.chars);
		} catch { /* the pty exited under the command; its exit reaches the node */ }
	}

	return { handle, killAll: () => { for (const id of [...live.keys()]) kill(id); }, size: () => live.size };
}

function main(serverDir) {
	let nodePty;
	try {
		nodePty = createRequire(join(serverDir, 'vscode', 'package.json'))('node-pty');
	} catch (error) {
		process.send({ op: 'unavailable', reason: error.message }, () => process.exit(1));
		return;
	}
	const sessions = createHostSessions({ spawn: nodePty.spawn, send: (message) => process.send(message), env: process.env, cwd: homedir() });
	process.on('message', (message) => sessions.handle(message));
	// The node stopped, crashed or cut the channel: no shell outlives it.
	process.on('disconnect', () => { sessions.killAll(); process.exit(0); });
	process.send({ op: 'ready' });
}

if (process.send && process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2]);
