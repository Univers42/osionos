// `osionos <folder>`: one user's shell talking to that user's node, through the store and refusals
// the picker uses, and a reader that never hangs on a node that is not there.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { requestFolder, startControlSocket } from '../../packages/osionos-node/control-socket.mjs';
import { createRootStore } from '../../packages/osionos-node/fs-roots.mjs';

async function fixture() {
	const base = await mkdtemp(join(tmpdir(), 'osionos-control-'));
	const home = join(base, 'home');
	const project = join(home, 'project');
	await mkdir(join(home, '.osionos'), { recursive: true });
	await mkdir(project);
	const roots = createRootStore({ file: join(home, '.osionos', 'roots.json'), home, nodeHome: join(home, '.osionos') });
	const socket = join(home, '.osionos', 'run', 'control.sock');
	return { base, home, project, roots, socket };
}

test('a path reaches the store and the answer comes back', async () => {
	const { base, project, roots, socket } = await fixture();
	const control = startControlSocket({ file: socket, onOpen: async (path) => ({ opened: (await roots.add(path, 'https://app')).realpath }) });
	await new Promise((done) => setTimeout(done, 50));
	assert.deepEqual(await requestFolder(socket, project), { opened: project });
	assert.equal((await roots.list('https://app'))[0].realpath, project);
	assert.equal(((await stat(socket)).mode & 0o777), 0o600);
	control.close();
	await rm(base, { recursive: true });
});

test('the home folder is refused by name, as in the picker', async () => {
	const { base, home, roots, socket } = await fixture();
	const control = startControlSocket({ file: socket, onOpen: async (path) => ({ opened: (await roots.add(path, 'https://app')).realpath }) });
	await new Promise((done) => setTimeout(done, 50));
	assert.deepEqual(await requestFolder(socket, home), { refused: 'PermissionDenied' });
	assert.deepEqual(await roots.list('https://app'), []);
	control.close();
	await rm(base, { recursive: true });
});

test('no node running is an error that says so', async () => {
	const { base, socket } = await fixture();
	await assert.rejects(requestFolder(socket, '/x'), /not running/);
	await rm(base, { recursive: true });
});
