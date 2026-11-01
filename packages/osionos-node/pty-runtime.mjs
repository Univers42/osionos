/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pty-runtime.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the web terminal borrows from the pinned VS Code server (devil verdict 2026-11-01, W6, W7):
// its `ws` for the socket and, in a child under its own `node`, its node-pty. The node package keeps
// no dependency of its own (U4: the server already ships both, at the version the pin names). The
// host starts on the first shell and fails closed: a host that cannot load node-pty, or dies, means
// no shell and a 4503 to the frame, never an exception in the node.
// Caveat: `ws` is whatever the pinned server bundles (8.21.0 in 1.138.0). Only its long-stable
// surface is used (WebSocketServer noServer, handleUpgrade, maxPayload, send, close); a pin bump
// to a ws with another API leaves /api/pty answering 503 until this file follows.
import { fork as forkChild } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PTY_LIMITS } from './pty-wire.mjs';

const HOST_SCRIPT = fileURLToPath(new URL('./pty-host.mjs', import.meta.url));
const HOST_GONE_EXIT = -1;

/** How the pty host runs: always the server's own node, so node-pty matches its ABI (W7). */
export function ptyHostCommand(serverDir) {
	return { execPath: join(serverDir, 'node'), script: HOST_SCRIPT, args: [serverDir] };
}

/** The server's ws, set up as the pty socket's acceptor; null when the server ships none. */
export function serverSocketAcceptor(serverDir) {
	let WebSocketServer;
	try {
		({ WebSocketServer } = createRequire(join(serverDir, 'vscode', 'package.json'))('ws'));
	} catch { return null; }
	if (typeof WebSocketServer !== 'function') return null;
	const wss = new WebSocketServer({ noServer: true, maxPayload: PTY_LIMITS.maxPayload, perMessageDeflate: false });
	return (req, socket, head) => new Promise((resolve) => wss.handleUpgrade(req, socket, head, resolve));
}

export function createPtyHost({ serverDir, env, cwd, fork = forkChild }) {
	let child = null;
	let nextId = 0;
	const spawning = new Map();
	const shells = new Map();

	const post = (message) => {
		try { if (child?.connected) child.send(message); } catch { /* the host is going; its exit follows */ }
	};

	function shellFor(id) {
		return {
			write: (data) => post({ op: 'write', id, data }),
			resize: (cols, rows) => post({ op: 'resize', id, cols, rows }),
			ack: (chars) => post({ op: 'ack', id, chars }),
			kill: () => { shells.delete(id); post({ op: 'kill', id }); },
		};
	}

	function onMessage(message) {
		const id = message?.id;
		if (message?.op === 'spawned' && spawning.has(id)) {
			const { resolve, events } = spawning.get(id);
			spawning.delete(id);
			shells.set(id, events);
			resolve(shellFor(id));
		} else if (message?.op === 'failed' && spawning.has(id)) {
			spawning.get(id).resolve(null);
			spawning.delete(id);
		} else if (message?.op === 'data') shells.get(id)?.data(message.data);
		else if (message?.op === 'exit' && shells.has(id)) {
			const events = shells.get(id);
			shells.delete(id);
			events.exit(message.exitCode);
		} else if (message?.op === 'unavailable') console.error(`osionos-node: no terminal: the server's node-pty did not load (${message.reason})`);
	}

	function onGone(which) {
		if (child !== which) return;
		child = null;
		for (const { resolve } of spawning.values()) resolve(null);
		spawning.clear();
		for (const events of shells.values()) events.exit(HOST_GONE_EXIT);
		shells.clear();
	}

	function start() {
		const { execPath, script, args } = ptyHostCommand(serverDir);
		const started = fork(script, args, { execPath, env, cwd, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], serialization: 'json' });
		started.on('message', onMessage);
		started.once('exit', () => onGone(started));
		started.once('error', () => onGone(started));
		return started;
	}

	return {
		spawn({ cols, rows }, events) {
			child ??= start();
			const id = ++nextId;
			return new Promise((resolve) => {
				spawning.set(id, { resolve, events });
				post({ op: 'spawn', id, cols, rows });
			});
		},
		// The host kills every shell when its channel closes (pty-host.mjs).
		stop() { child?.disconnect?.(); },
	};
}
