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
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { isNodeId } from '../../scripts/ide-token.mjs';
import { createIdeOriginServer } from './ide-origin.mjs';
import { SERVER_PIN } from './pin.mjs';
import { ensureServer } from './server-launch.mjs';
import { createClientHandler } from './static-client.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CLIENT = fileURLToPath(new URL('../../dist-ide', import.meta.url));

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

export function readServeConfig(argv, env) {
	const { values } = parseArgs({
		args: argv, strict: true,
		options: { node: { type: 'string' }, server: { type: 'string' }, listen: { type: 'string', default: '127.0.0.1:4100' }, 'app-origin': { type: 'string' }, 'ide-origin': { type: 'string' }, client: { type: 'string', default: DEFAULT_CLIENT } },
	});
	if (!isNodeId(values.node)) throw new Error('--node must be a short lowercase name, e.g. laptop');
	if (!values.server) throw new Error('--server must name the unpacked server\'s lib directory');
	const secret = env.OSIONOS_IDE_TOKEN_SECRET;
	if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('OSIONOS_IDE_TOKEN_SECRET must be set to the bridge\'s IDE secret (32+ bytes)');
	if (!UUID.test(env.OSIONOS_IDE_OWNER ?? '')) throw new Error('OSIONOS_IDE_OWNER must be the owner\'s user id (a UUID)');
	const listen = readListen(values.listen);
	const home = env.HOME;
	const dataDir = join(home, '.osionos', 'server-data');
	return {
		node: values.node, secret, ownerId: env.OSIONOS_IDE_OWNER, listen, appOrigin: values['app-origin'], client: values.client,
		ideOrigin: values['ide-origin'] ?? `http://${listen.host}:${listen.port}`,
		serverDir: values.server, nodeBin: join(values.server, 'node'),
		// A1: not $XDG_RUNTIME_DIR, which logind removes at an ssh-only user's last logout.
		socketDir: join(home, '.osionos', 'run'), dataDir,
		extensionRoots: [join(values.server, 'vscode', 'extensions'), join(dataDir, 'extensions')],
	};
}

async function serve(argv, env) {
	const config = readServeConfig(argv, env);
	const server = await ensureServer({ ...config, loginShell: userInfo().shell ?? '/bin/sh', baseEnv: env });
	const origin = createIdeOriginServer({
		secret: config.secret, ownerId: config.ownerId, ideOrigin: config.ideOrigin, commit: SERVER_PIN.server.commit,
		nodes: { [config.node]: { socketPath: server.socketPath, extensionRoots: config.extensionRoots } },
		client: createClientHandler({ root: config.client, appOrigin: config.appOrigin }),
	});
	await new Promise((resolve, reject) => origin.server.once('error', reject).listen(config.listen.port, config.listen.host, resolve));
	console.log(`osionos-node: ${config.node} on ${config.ideOrigin} (server ${server.reused ? 'reused' : `pid ${server.pid}`})`);
	const stop = async () => { origin.close(); await server.stop(); process.exit(0); };
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const [command, ...rest] = process.argv.slice(2);
	const run = command === 'serve' ? serve(rest, process.env) : Promise.reject(new Error('usage: osionos-node serve --node <id> --server <lib dir> --app-origin <origin> [--listen 127.0.0.1:4100] [--ide-origin <origin>] [--client <dist-ide>]'));
	run.catch((error) => { console.error(`osionos-node: ${error.message}`); process.exit(1); });
}
