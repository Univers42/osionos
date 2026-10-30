/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-node-cli.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `osionos-node serve` reads its whole configuration up front and refuses what the verdict
// forbids: a wildcard or public listen address (C8), a missing secret or owner, a bad node id.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readServeConfig } from '../../packages/osionos-node/cli.mjs';

const ENV = { OSIONOS_IDE_TOKEN_SECRET: 'k'.repeat(32), OSIONOS_IDE_OWNER: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', HOME: '/home/me' };
const ARGS = ['--node', 'laptop', '--server', '/opt/osionos-server/1.138.0/lib', '--app-origin', 'http://localhost:3001', '--client', '/srv/dist-ide'];

test('serve reads node, server, listen address, app origin and the owner from env', () => {
	const config = readServeConfig([...ARGS, '--listen', '127.0.0.1:4100'], ENV);
	assert.equal(config.node, 'laptop');
	assert.deepEqual(config.listen, { host: '127.0.0.1', port: 4100 });
	assert.equal(config.ownerId, ENV.OSIONOS_IDE_OWNER);
	assert.equal(config.nodeBin, '/opt/osionos-server/1.138.0/lib/node');
	assert.equal(config.socketDir, '/home/me/.osionos/run');
	assert.equal(config.dataDir, '/home/me/.osionos/server-data');
	assert.deepEqual(config.extensionRoots, ['/opt/osionos-server/1.138.0/lib/vscode/extensions', '/home/me/.osionos/server-data/extensions']);
	assert.equal(config.ideOrigin, 'http://127.0.0.1:4100');
});

test('the listen address defaults to loopback, and a wildcard or public bind is refused', () => {
	assert.deepEqual(readServeConfig(ARGS, ENV).listen, { host: '127.0.0.1', port: 4100 });
	for (const listen of ['0.0.0.0:4100', '[::]:4100', ':4100', '8.8.8.8:4100', '127.0.0.1:0', '127.0.0.1:99999']) {
		assert.throws(() => readServeConfig([...ARGS, '--listen', listen], ENV), /listen/, listen);
	}
	assert.deepEqual(readServeConfig([...ARGS, '--listen', '100.94.119.97:4100'], ENV).listen, { host: '100.94.119.97', port: 4100 }, 'a tailnet address is private');
});

test('an IDE origin other than the listen address can be named (a reverse proxy in front)', () => {
	assert.equal(readServeConfig([...ARGS, '--ide-origin', 'https://ide.tail10f2ea.ts.net'], ENV).ideOrigin, 'https://ide.tail10f2ea.ts.net');
});

test('a missing secret, owner, node or server stops the start with a reason', () => {
	assert.throws(() => readServeConfig(ARGS, { ...ENV, OSIONOS_IDE_TOKEN_SECRET: 'short' }), /OSIONOS_IDE_TOKEN_SECRET/);
	assert.throws(() => readServeConfig(ARGS, { ...ENV, OSIONOS_IDE_OWNER: 'me' }), /OSIONOS_IDE_OWNER/);
	assert.throws(() => readServeConfig(['--node', 'Laptop', ...ARGS.slice(2)], ENV), /--node/);
	assert.throws(() => readServeConfig(ARGS.slice(0, 2), ENV), /--server/);
});
