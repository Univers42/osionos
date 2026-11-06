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
import { spawnSync } from 'node:child_process';
import { controlFile, requestFolder, startControlSocket } from './control-socket.mjs';
import { existsSync, realpathSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { isNodeId } from '../../scripts/ide-token.mjs';
import { createHeartbeat } from './heartbeat.mjs';
import { createRootStore } from './fs-roots.mjs';
import { FS_LIMITS } from './fs-wire.mjs';
import { createIdeOriginServer } from './ide-origin.mjs';
import { createMachineSession, loadMachine } from './machine-identity.mjs';
import { pairMachine } from './pair.mjs';
import { createRememberedComputers } from './remembered-computers.mjs';
import { SERVER_PIN } from './pin.mjs';
import { createPtyHost, serverSocketAcceptor } from './pty-runtime.mjs';
import { isRememberOrigin } from './pty-wire.mjs';
import { ensureServer, preferredShell, serverEnv } from './server-launch.mjs';
import { createClientHandler } from './static-client.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CLIENT = fileURLToPath(new URL('../../dist-ide', import.meta.url));
const DEFAULT_TERMINAL = fileURLToPath(new URL('../../build/terminal', import.meta.url));
const DEFAULT_EDITOR = fileURLToPath(new URL('../../build/editor', import.meta.url));

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

// The app origins whose frames may remember this computer (devil verdict 2026-11-01, Amendment 1, R5;
// groot ADR 0041: production and, by the owner's override, the beta). Each must also frame the node.
function readRememberOrigins(origins, appOrigins, machine) {
	if (origins.length > 0 && !machine) throw new Error('--remember-origin needs a paired machine: the shared-secret mode opens no shell');
	for (const origin of origins) {
		if (!isRememberOrigin(origin)) throw new Error(`--remember-origin must be an https app origin, e.g. https://baas.tail10f2ea.ts.net:8443 (got ${origin})`);
		if (!appOrigins.includes(origin)) throw new Error(`--remember-origin ${origin} must also be an --app-origin`);
	}
	return origins;
}

export function readServeConfig(argv, env, machine = null) {
	const { values } = parseArgs({
		args: argv, strict: true,
		options: { node: { type: 'string' }, server: { type: 'string' }, listen: { type: 'string', default: '127.0.0.1:4100' }, 'app-origin': { type: 'string', multiple: true }, 'remember-origin': { type: 'string', multiple: true }, 'ide-origin': { type: 'string' }, client: { type: 'string', default: DEFAULT_CLIENT }, terminal: { type: 'string', default: DEFAULT_TERMINAL } },
	});
	if (!values.server) throw new Error('--server must name the unpacked server\'s lib directory');
	const listen = readListen(values.listen);
	const identity = machine ? pairedIdentity(values, env, machine, listen) : sharedSecretIdentity(values, env);
	const appOrigins = values['app-origin'] ?? [];
	const rememberOrigins = readRememberOrigins(values['remember-origin'] ?? [], appOrigins, machine);
	const home = env.HOME;
	const dataDir = join(home, '.osionos', 'server-data');
	return {
		...identity, listen, appOrigins, rememberOrigins, client: values.client, terminal: values.terminal,
		ideOrigin: values['ide-origin'] ?? `http://${listen.host}:${listen.port}`,
		serverDir: values.server, nodeBin: join(values.server, 'node'),
		// A1: not $XDG_RUNTIME_DIR, which logind removes at an ssh-only user's last logout.
		socketDir: join(home, '.osionos', 'run'), dataDir,
		extensionRoots: [join(values.server, 'vscode', 'extensions'), join(dataDir, 'extensions')],
	};
}

const machineFile = (env) => join(env.HOME ?? homedir(), '.osionos', 'machine.json');
const rememberedFile = (env) => join(env.HOME ?? homedir(), '.osionos', 'remembered-computers.json');

// Loaded on every paired start, even with no --remember-origin, so dropping an origin deletes the
// computers it remembered (R5, R7); offered to the terminal only when an origin remains.
function rememberedFor(config, env) {
	if (!config.machine) return null;
	const devices = createRememberedComputers({ file: rememberedFile(env), owner: config.ownerId, machine: config.node, origins: config.rememberOrigins });
	return config.rememberOrigins.length > 0 ? devices : null;
}

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

// A page missing here used to surface as a 404 inside the app's terminal panel, with nothing
// naming the build that had not run.
function assertPagesBuilt(config) {
	for (const [root, script] of [[config.client, 'build:ide'], [config.terminal ?? DEFAULT_TERMINAL, 'build:terminal']]) {
		if (root && !existsSync(join(root, 'index.html'))) {
			throw new Error(`${join(root, 'index.html')} is missing: run packages/osionos-node/install.sh, or pnpm ${script} in the checkout`);
		}
	}
}

// The editor's disk (devil verdict 2026-11-01 editor on disk): paired machines only, with its own
// WebSocket server, so the pty's pre-auth bound stays the pty's (F6).
function diskFor(config, home, env) {
	if (!config.machine) return undefined;
	const accept = serverSocketAcceptor(config.serverDir, FS_LIMITS.maxPayload);
	if (!accept) return undefined;
	const nodeHome = join(env.HOME ?? homedir(), '.osionos');
	return { accept, home, appOrigins: config.appOrigins, roots: createRootStore({ file: join(nodeHome, 'roots.json'), home, nodeHome }) };
}

/** One folder for every app this node serves; the store applies the picker's refusals. */
async function openRoot(service, roots, appOrigins, path) {
	if (!isAbsolute(path)) throw new Error('InvalidPath');
	const added = await Promise.all(appOrigins.map((origin) => roots.add(path, origin)));
	service.announceRoots(appOrigins);
	return { opened: added[0]?.realpath ?? path };
}

async function openFolder(argv, env) {
	if (argv.length !== 1) throw new Error('usage: osionos <folder>');
	const answer = await requestFolder(controlFile(env), resolve(argv[0]));
	if (answer.refused) throw new Error(`${argv[0]} cannot be opened (${answer.refused}): choose a project folder, not /, your home or a folder above it`);
	console.log(`Opened ${answer.opened} in the Explorer, under This computer.`);
}

async function serve(argv, env) {
	const config = readServeConfig(argv, env, loadMachine(machineFile(env)));
	assertPagesBuilt(config);
	const loginShell = preferredShell(env, userInfo().shell);
	const home = env.HOME ?? homedir();
	const server = await ensureServer({ ...config, loginShell, baseEnv: env });
	const session = config.machine ? createMachineSession({ machine: config.machine, home }) : null;
	const terminal = terminalFor(config, home, serverEnv(env, loginShell));
	const disk = diskFor(config, home, env);
	const diskRoots = disk?.roots;
	const origin = createIdeOriginServer({
		...(session ? session.originOptions : { secret: config.secret }),
		ownerId: config.ownerId, ideOrigin: config.ideOrigin, commit: SERVER_PIN.server.commit,
		nodes: { [config.node]: { socketPath: server.socketPath, extensionRoots: config.extensionRoots } },
		client: createClientHandler({ root: config.client, terminalRoot: config.terminal, editorRoot: existsSync(join(DEFAULT_EDITOR, 'index.html')) ? DEFAULT_EDITOR : null, appOrigins: config.appOrigins }),
		pty: terminal.pty,
		fs: disk,
		devices: terminal.pty ? rememberedFor(config, env) : null,
	});
	await new Promise((resolve, reject) => origin.server.once('error', reject).listen(config.listen.port, config.listen.host, resolve));
	console.log(`osionos-node: ${config.node} on ${config.ideOrigin} (server ${server.reused ? 'reused' : `pid ${server.pid}`})`);
	const control = origin.fs ? startControlSocket({ file: controlFile(env), onOpen: (path) => openRoot(origin.fs, diskRoots, config.appOrigins, path) }) : null;
	const stop = async () => { control?.close(); origin.close(); terminal.host?.stop(); await server.stop(); process.exit(0); };
	if (session) {
		const beat = createHeartbeat({
			file: machineFile(env), keys: session.keys, ideOrigin: config.ideOrigin, forget: [rememberedFile(env)],
			onGone: () => { console.error('osionos-node: this machine was removed from its account; it forgot its identity'); void stop(); },
		});
		beat.start();
	}
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
}

const USAGE = [
	'usage: osionos-node connect --bridge <url> --app-origin <origin>... [--remember-origin <origin>...] [--name <name>] [--pair-only]',
	'       osionos-node pair --bridge <url> --name <name> [--accept-account <email>]',
	'       osionos-node serve --server <lib dir> --app-origin <origin>... [--remember-origin <origin>...] [--listen 127.0.0.1:4100] [--client <dist-ide>] [--terminal <build/terminal>]',
	'       (unpaired, milestone 1: add --node <id> and OSIONOS_IDE_TOKEN_SECRET / OSIONOS_IDE_OWNER)',
	'       osionos-node update',
].join('\n');

async function updateNode(argv, env) {
	const installScript = fileURLToPath(new URL('./install.sh', import.meta.url));
	const res = spawnSync('/bin/sh', [installScript, ...argv], {
		stdio: 'inherit',
		env: { ...process.env, ...env },
	});
	if (res.status !== 0) {
		throw new Error(`update failed with code ${res.status ?? 1}`);
	}
}

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
const shortHostName = () => hostname().split('.')[0].replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 64) || userInfo().username;

// Everything a person has to do, in order, in one command. A code lives 5 minutes, and an
// expired one is a new code here, not a dead terminal: pairing then serving as two commands
// left machines paired with nothing running, and interrupted pairings with no explanation.
async function connect(argv, env) {
	const { values } = parseArgs({ args: argv, strict: true, options: {
		bridge: { type: 'string' }, name: { type: 'string' }, 'app-origin': { type: 'string', multiple: true },
		'remember-origin': { type: 'string', multiple: true }, 'pair-only': { type: 'boolean' },
	} });
	if (!values.bridge) throw new Error('--bridge must be the osionos bridge URL');
	if (!values['app-origin']?.length) throw new Error('--app-origin must name the app');
	while (!loadMachine(machineFile(env))) {
		try {
			await pair(['--bridge', values.bridge, '--name', values.name ?? shortHostName()], env);
		} catch (error) {
			if (!/code expired/.test(error.message)) throw error;
			console.log('That code expired. Here is a new one.');
		}
	}
	if (values['pair-only']) return;
	const server = join(env.HOME ?? homedir(), '.osionos', 'server', SERVER_PIN.server.vscode);
	const named = (flag, origins = []) => origins.flatMap((origin) => [flag, origin]);
	await serve(['--server', server, ...named('--app-origin', values['app-origin']), ...named('--remember-origin', values['remember-origin'])], env);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
	const [command, ...rest] = process.argv.slice(2);
	const commands = { serve: () => serve(rest, process.env), pair: () => pair(rest, process.env), connect: () => connect(rest, process.env), open: () => openFolder(rest, process.env), update: () => updateNode(rest, process.env) };
	const run = commands[command]?.() ?? Promise.reject(new Error(USAGE));
	run.catch((error) => { console.error(`osionos-node: ${error.message}`); process.exit(1); });
}
