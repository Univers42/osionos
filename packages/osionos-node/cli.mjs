#!/usr/bin/env node
/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cli.mjs                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `osionos-node serve`: runs this machine's VS Code server on its private socket and the IDE
// origin in front of it (ADR-006). Milestone 1 is the owner's own machine, owner-only. The secret
// comes from the environment only, never argv, which other local users can read in ps.
import { realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { isNodeId } from '../../scripts/ide-token.mjs';
import { createHeartbeat } from './heartbeat.mjs';
import { createIdeOriginServer } from './ide-origin.mjs';
import { createMachineSession, loadMachine } from './machine-identity.mjs';
import { pairMachine } from './pair.mjs';
import { SERVER_PIN } from './pin.mjs';
import { createPtyHost, serverSocketAcceptor } from './pty-runtime.mjs';
import { ensureServer, serverEnv } from './server-launch.mjs';
import { createClientHandler } from './static-client.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CLIENT = fileURLToPath(new URL('../../dist-ide', import.meta.url));
const DEFAULT_TERMINAL = fileURLToPath(new URL('../../build/terminal', import.meta.url));

// Loopback, RFC 1918 and the tailnet's CGNAT range (100.64.0.0/10): never a wildcard, never a
// public address (C8).
function isPrivateIpv4(host) {
	const parts = host.split('.').map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
	const [a, b] = parts;
	return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function readListen(value) {
	const match = /^([0-9.]+):(\d{1,5})$/.exec(value);
	const port = Number(match?.[2]);
	if (!match || !isPrivateIpv4(match[1]) || port < 1 || port > 65535) {
		throw new Error(`--listen must be a private IPv4 address and port, e.g. 127.0.0.1:4100 (got ${value})`);
	}
	return { host: match[1], port };
}

// A paired machine (machine.json) brings its own id and owner and trusts only bridge-signed
// tokens; the shared-secret mode is milestone 1's laptop until it re-pairs (devil 2026-10-31, 10).
function pairedIdentity(values, env, machine, listen) {
	if (values.node !== undefined) throw new Error('--node is the paired machine id; remove it (machine.json names it)');
	if (env.OSIONOS_IDE_TOKEN_SECRET !== undefined) throw new Error('this machine is paired: unset OSIONOS_IDE_TOKEN_SECRET, a paired machine holds no shared secret');
	if (!listen.host.startsWith('127.')) throw new Error('a paired machine listens on 127.0.0.0/8 only until remote machines are ruled on');
	return { node: machine.machineId, secret: undefined, ownerId: machine.ownerId, machine };
}

function sharedSecretIdentity(values, env) {
	if (values.node === undefined) throw new Error(`this machine is not paired yet. Run: node ${process.argv[1]} pair --bridge <bridge url> --name <name>, and keep it running until you approve it in the app`);
	if (!isNodeId(values.node)) throw new Error('--node must be a short lowercase name, e.g. laptop');
	const secret = env.OSIONOS_IDE_TOKEN_SECRET;
	if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('OSIONOS_IDE_TOKEN_SECRET must be set to the bridge\'s IDE secret (32+ bytes)');
	if (!UUID.test(env.OSIONOS_IDE_OWNER ?? '')) throw new Error('OSIONOS_IDE_OWNER must be the owner\'s user id (a UUID)');
	return { node: values.node, secret, ownerId: env.OSIONOS_IDE_OWNER, machine: null };
}

export function readServeConfig(argv, env, machine = null) {
	const { values } = parseArgs({
		args: argv, strict: true,
		options: { node: { type: 'string' }, server: { type: 'string' }, listen: { type: 'string', default: '127.0.0.1:4100' }, 'app-origin': { type: 'string', multiple: true }, 'ide-origin': { type: 'string' }, client: { type: 'string', default: DEFAULT_CLIENT }, terminal: { type: 'string', default: DEFAULT_TERMINAL } },
	});
	if (!values.server) throw new Error('--server must name the unpacked server\'s lib directory');
	const listen = readListen(values.listen);
	const identity = machine ? pairedIdentity(values, env, machine, listen) : sharedSecretIdentity(values, env);
	const home = env.HOME;
	const dataDir = join(home, '.osionos', 'server-data');
	return {
		...identity, listen, appOrigins: values['app-origin'] ?? [], client: values.client, terminal: values.terminal,
		ideOrigin: values['ide-origin'] ?? `http://${listen.host}:${listen.port}`,
		serverDir: values.server, nodeBin: join(values.server, 'node'),
		// A1: not $XDG_RUNTIME_DIR, which logind removes at an ssh-only user's last logout.
		socketDir: join(home, '.osionos', 'run'), dataDir,
		extensionRoots: [join(values.server, 'vscode', 'extensions'), join(dataDir, 'extensions')],
	};
}

const machineFile = (env) => join(env.HOME ?? homedir(), '.osionos', 'machine.json');

// The web terminal of a paired machine (ADR 0041): shells run as this user, in $HOME, with the
// server's env, under the pinned server's own node and node-pty. Without the server's ws there is
// no /api/pty (404), never a hand-rolled socket (W6).
function terminalFor(config, home, shellEnv) {
	if (!config.machine) return { pty: undefined, host: null };
	const accept = serverSocketAcceptor(config.serverDir);
	if (!accept) {
		console.error('osionos-node: no web terminal: the pinned server ships no ws');
		return { pty: undefined, host: null };
	}
	const host = createPtyHost({ serverDir: config.serverDir, env: shellEnv, cwd: home });
	return { pty: { host, accept }, host };
}

async function serve(argv, env) {
	const config = readServeConfig(argv, env, loadMachine(machineFile(env)));
	const loginShell = userInfo().shell ?? '/bin/sh';
	const home = env.HOME ?? homedir();
	const server = await ensureServer({ ...config, loginShell, baseEnv: env });
	const session = config.machine ? createMachineSession({ machine: config.machine, home }) : null;
	const terminal = terminalFor(config, home, serverEnv(env, loginShell));
	const origin = createIdeOriginServer({
		...(session ? session.originOptions : { secret: config.secret }),
		ownerId: config.ownerId, ideOrigin: config.ideOrigin, commit: SERVER_PIN.server.commit,
		nodes: { [config.node]: { socketPath: server.socketPath, extensionRoots: config.extensionRoots } },
		client: createClientHandler({ root: config.client, terminalRoot: config.terminal, appOrigins: config.appOrigins }),
		pty: terminal.pty,
	});
	await new Promise((resolve, reject) => origin.server.once('error', reject).listen(config.listen.port, config.listen.host, resolve));
	console.log(`osionos-node: ${config.node} on ${config.ideOrigin} (server ${server.reused ? 'reused' : `pid ${server.pid}`})`);
	const stop = async () => { origin.close(); terminal.host?.stop(); await server.stop(); process.exit(0); };
	if (session) {
		const beat = createHeartbeat({
			file: machineFile(env), keys: session.keys, ideOrigin: config.ideOrigin,
			onGone: () => { console.error('osionos-node: this machine was removed from its account; it forgot its identity'); void stop(); },
		});
		beat.start();
	}
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
}

const USAGE = [
	'usage: osionos-node pair --bridge <url> --name <name> [--accept-account <email>]',
	'       osionos-node serve --server <lib dir> --app-origin <origin>... [--listen 127.0.0.1:4100] [--client <dist-ide>] [--terminal <build/terminal>]',
	'       (unpaired, milestone 1: add --node <id> and OSIONOS_IDE_TOKEN_SECRET / OSIONOS_IDE_OWNER)',
].join('\n');

async function pair(argv, env) {
	const { values } = parseArgs({ args: argv, strict: true, options: { bridge: { type: 'string' }, name: { type: 'string' }, 'accept-account': { type: 'string' } } });
	if (!values.bridge) throw new Error('--bridge must be the osionos bridge URL, e.g. https://baas.tail10f2ea.ts.net:10000');
	const file = machineFile(env);
	if (loadMachine(file)) throw new Error(`${file} exists: this machine is already paired (remove it in the app first)`);
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	try {
		await pairMachine({
			bridge: values.bridge, name: values.name ?? userInfo().username, file, platform: `${process.platform}-${process.arch}`,
			acceptAccount: values['accept-account'], confirm: async (question) => /^y(es)?$/i.test((await prompt.question(question)).trim()),
		});
	} finally {
		prompt.close();
	}
}

// Real paths: node resolves this module through a symlink and argv[1] does not, so a
// run through ~/.osionos/src did nothing at all and exited 0.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
	const [command, ...rest] = process.argv.slice(2);
	const commands = { serve: () => serve(rest, process.env), pair: () => pair(rest, process.env) };
	const run = commands[command]?.() ?? Promise.reject(new Error(USAGE));
	run.catch((error) => { console.error(`osionos-node: ${error.message}`); process.exit(1); });
}
