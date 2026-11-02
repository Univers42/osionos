// The editor's disk ops on a temp-dir fixture (devil verdict 2026-11-01 editor on disk, F8, F9, F10,
// F11, F13, F15; groot ADR 0044): every path resolves under its root, a save never clobbers, a delete
// never follows a symlink out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { list, mkdir, pick, read, remove, rename, stat } from '../../packages/osionos-node/fs-ops.mjs';
import { save } from '../../packages/osionos-node/fs-save.mjs';
import { createRootStore, MAX_ROOTS } from '../../packages/osionos-node/fs-roots.mjs';
import { FS_LIMITS } from '../../packages/osionos-node/fs-wire.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const code = (expected) => (error) => error?.wireCode === expected;

function fixture(t) {
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'fs-disk-')));
	t.after(() => rmSync(base, { recursive: true, force: true }));
	const root = join(base, 'root');
	const outside = join(base, 'outside');
	mkdirSync(join(root, 'src'), { recursive: true });
	mkdirSync(outside);
	writeFileSync(join(root, 'a.txt'), 'inside');
	writeFileSync(join(outside, 'secret.txt'), 'outside');
	return { base, root, outside };
}

test('F8: escapes are refused — dot-dot, absolute, symlinked dir, chain, symlinked parent, mkdir and rename through a link', async (t) => {
	const { root, outside } = fixture(t);
	symlinkSync(outside, join(root, 'out'));
	symlinkSync(join(root, 'out'), join(root, 'chain1'));
	symlinkSync(join(root, 'chain1'), join(root, 'chain2'));
	symlinkSync(join(outside, 'secret.txt'), join(root, 'file-link'));
	const denied = code('PermissionDenied');
	await assert.rejects(read(root, '../outside/secret.txt', 0, 100), denied);
	await assert.rejects(read(root, `..${outside}/secret.txt`, 0, 100));
	await assert.rejects(list(root, 'out'), denied);
	await assert.rejects(list(root, 'chain2'), denied);
	await assert.rejects(read(root, 'file-link', 0, 100), denied);
	await assert.rejects(read(root, 'out/secret.txt', 0, 100), denied);
	await assert.rejects(save(root, 'out/new.txt', Buffer.from('x'), { expect: null, create: true, overwrite: false }), denied);
	await assert.rejects(save(root, 'file-link', Buffer.from('x'), { expect: 'any', create: true, overwrite: true }), denied);
	await assert.rejects(mkdir(root, 'out/made'), denied);
	await assert.rejects(rename(root, 'a.txt', 'out/a.txt', false), denied);
	await assert.rejects(remove(root, 'out/secret.txt', false), denied);
	assert.deepEqual(readdirSync(outside), ['secret.txt']);
	assert.equal(readFileSync(join(outside, 'secret.txt'), 'utf8'), 'outside');
	assert.equal(existsSync(join(root, 'a.txt')), true);
});

test('F8: a root swapped for a symlink after it was added resolves nowhere, and its store entry is dropped', async (t) => {
	const { base, root, outside } = fixture(t);
	const store = createRootStore({ file: join(base, 'roots.json'), home: join(base, 'home'), nodeHome: join(base, 'home', '.osionos') });
	await store.add(root, 'https://app.example');
	renameSync(root, join(base, 'moved'));
	symlinkSync(outside, root);
	await assert.rejects(read(root, 'secret.txt', 0, 100), code('PermissionDenied'));
	assert.deepEqual(await store.list('https://app.example'), []);
});

test('F8: deleting a symlink removes the link, not its target', async (t) => {
	const { root, outside } = fixture(t);
	symlinkSync(outside, join(root, 'out'));
	await remove(root, 'out', true);
	assert.equal(existsSync(join(root, 'out')), false);
	assert.deepEqual(readdirSync(outside), ['secret.txt']);
});

test('F15: a recursive delete of a folder holding a symlink to an outside folder leaves the outside untouched; the root itself is refused', async (t) => {
	const { root, outside } = fixture(t);
	mkdirSync(join(root, 'doomed', 'deep'), { recursive: true });
	symlinkSync(outside, join(root, 'doomed', 'deep', 'out'));
	writeFileSync(join(root, 'doomed', 'f.txt'), 'f');
	await assert.rejects(remove(root, 'doomed', false), code('NotEmpty'));
	await remove(root, 'doomed', true);
	assert.equal(existsSync(join(root, 'doomed')), false);
	assert.deepEqual(readdirSync(outside), ['secret.txt']);
	await assert.rejects(remove(root, '', true), code('PermissionDenied'));
	assert.equal(existsSync(root), true);
});

test('F9: /, $HOME, an ancestor of $HOME, ~/.osionos, inside it, a folder holding it, and a file are refused as roots', async (t) => {
	const { base, root } = fixture(t);
	const home = join(base, 'home');
	const nodeHome = join(home, '.osionos');
	mkdirSync(join(nodeHome, 'src'), { recursive: true });
	mkdirSync(join(home, 'project'));
	const store = createRootStore({ file: join(base, 'roots.json'), home, nodeHome });
	const refused = code('PermissionDenied');
	for (const dir of ['/', home, base, nodeHome, join(nodeHome, 'src'), join(root, 'a.txt')]) {
		await assert.rejects(store.add(dir, 'https://app.example'), refused, dir);
	}
	const added = await store.add(join(home, 'project'), 'https://app.example');
	assert.equal(added.realpath, join(home, 'project'));
	assert.equal(statSync(join(base, 'roots.json')).mode & 0o777, 0o600);
	const saved = JSON.parse(readFileSync(join(base, 'roots.json'), 'utf8'));
	assert.deepEqual(Object.keys(saved.roots[0]).sort(), ['addedAt', 'appOrigin', 'id', 'realpath']);
});

test('F9: a root added under production is absent under the beta; at most 32; forget deletes the file', async (t) => {
	const { base } = fixture(t);
	const home = join(base, 'home');
	const store = createRootStore({ file: join(base, 'roots.json'), home, nodeHome: join(home, '.osionos') });
	for (let i = 0; i < MAX_ROOTS; i += 1) {
		mkdirSync(join(base, `p${i}`));
		await store.add(join(base, `p${i}`), 'https://prod.example');
	}
	mkdirSync(join(base, 'one-more'));
	await assert.rejects(store.add(join(base, 'one-more'), 'https://prod.example'), code('NoSpace'));
	assert.equal((await store.list('https://prod.example')).length, MAX_ROOTS);
	assert.deepEqual(await store.list('https://beta.example'), []);
	await store.forget();
	assert.equal(existsSync(join(base, 'roots.json')), false);
});

test('F10: the picker returns 2000 folder names, no file name, truncated, and hides dot-folders unless asked', async (t) => {
	const { base } = fixture(t);
	const home = join(base, 'pickhome');
	mkdirSync(home);
	for (let i = 0; i < 3000; i += 1) mkdirSync(join(home, `d${i}`));
	for (let i = 0; i < 10; i += 1) writeFileSync(join(home, `file${i}.txt`), 'x');
	const result = await pick(home, '', false);
	assert.deepEqual(Object.keys(result).sort(), ['dirs', 'truncated']);
	assert.equal(result.dirs.length, FS_LIMITS.maxPickEntries);
	assert.equal(result.truncated, true);
	assert.equal(result.dirs.some((name) => name.startsWith('file')), false);
	const small = join(base, 'smallhome');
	mkdirSync(join(small, '.config'), { recursive: true });
	mkdirSync(join(small, 'code'));
	assert.deepEqual((await pick(small, '', false)).dirs, ['code']);
	assert.deepEqual((await pick(small, '', true)).dirs, ['.config', 'code']);
});

test('F11: a 100k-entry folder answers 5000 entries with truncated, inside the bound', async (t) => {
	const { root } = fixture(t);
	mkdirSync(join(root, 'huge'));
	for (let i = 0; i < 100_000; i += 1) writeFileSync(join(root, 'huge', `f${i}`), '');
	const started = performance.now();
	const result = await list(root, 'huge');
	const ms = performance.now() - started;
	assert.equal(result.entries.length, FS_LIMITS.maxListEntries);
	assert.equal(result.truncated, true);
	assert.ok(ms < 10_000, `listed in ${ms} ms`);
	console.log(`# F11: 100k-entry list answered in ${ms.toFixed(0)} ms`);
});

test('F11: a file over 8 MiB is not opened', async (t) => {
	const { root } = fixture(t);
	writeFileSync(join(root, 'big.bin'), Buffer.alloc(FS_LIMITS.maxFileBytes + 1));
	await assert.rejects(read(root, 'big.bin', 0, 10), code('TooLarge'));
	assert.equal((await stat(root, 'big.bin')).size, FS_LIMITS.maxFileBytes + 1);
});

test('F13: the disk changed after load gives a Conflict, and the disk bytes stay as they were', async (t) => {
	const { root } = fixture(t);
	const loaded = readFileSync(join(root, 'a.txt'));
	writeFileSync(join(root, 'a.txt'), 'changed by the terminal');
	await assert.rejects(save(root, 'a.txt', Buffer.from('mine'), { expect: sha(loaded), create: false, overwrite: true }), code('Conflict'));
	assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'changed by the terminal');
	await save(root, 'a.txt', Buffer.from('mine'), { expect: sha(Buffer.from('changed by the terminal')), create: false, overwrite: true });
	assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'mine');
	rmSync(join(root, 'a.txt'));
	await assert.rejects(save(root, 'a.txt', Buffer.from('mine'), { expect: sha(Buffer.from('mine')), create: true, overwrite: true }), code('Conflict'));
	assert.equal(existsSync(join(root, 'a.txt')), false);
});

test('F13: a kill between the temp file and the rename leaves the original intact', async (t) => {
	const { root } = fixture(t);
	const before = readFileSync(join(root, 'a.txt'));
	const killed = new Error('killed');
	await assert.rejects(save(root, 'a.txt', Buffer.from('half'), { expect: sha(before), create: false, overwrite: true }, { beforeRename: () => { throw killed; } }));
	assert.deepEqual(readFileSync(join(root, 'a.txt')), before);
	assert.deepEqual(readdirSync(root).sort(), ['a.txt', 'src']);
});

test('F13: mode 0755 is kept, and a symlinked file is still a symlink after a save', async (t) => {
	const { root } = fixture(t);
	writeFileSync(join(root, 'run.sh'), '#!/bin/sh\n');
	chmodSync(join(root, 'run.sh'), 0o755);
	await save(root, 'run.sh', Buffer.from('#!/bin/sh\necho hi\n'), { expect: sha(Buffer.from('#!/bin/sh\n')), create: false, overwrite: true });
	assert.equal(statSync(join(root, 'run.sh')).mode & 0o7777, 0o755);
	symlinkSync('src/real.txt', join(root, 'alias.txt'));
	writeFileSync(join(root, 'src', 'real.txt'), 'v1');
	await save(root, 'alias.txt', Buffer.from('v2'), { expect: sha(Buffer.from('v1')), create: false, overwrite: true });
	assert.equal(lstatSync(join(root, 'alias.txt')).isSymbolicLink(), true);
	assert.equal(readFileSync(join(root, 'src', 'real.txt'), 'utf8'), 'v2');
});

test('F13: a new file never replaces one that appeared meanwhile', async (t) => {
	const { root } = fixture(t);
	await save(root, 'new.txt', Buffer.from('first'), { expect: null, create: true, overwrite: false });
	await assert.rejects(save(root, 'new.txt', Buffer.from('second'), { expect: null, create: true, overwrite: true }), code('Conflict'));
	assert.equal(readFileSync(join(root, 'new.txt'), 'utf8'), 'first');
});
