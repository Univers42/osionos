/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-node-pin.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The client library and the VS Code server move as one pin (devil verdict 2026-10-30, C1-C3):
// a skew is a test failure, an artifact is checked before it is unpacked, and the slim server
// is built the same way twice and still carries the built-ins the IDE relies on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { SERVER_PIN, assertPinsAgree } from '../../packages/osionos-node/pin.mjs';
import { sha256File, verifyArtifact } from '../../packages/osionos-node/artifact.mjs';
import { packSlimServer } from '../../packages/osionos-node/slim-pack.mjs';

test('the pinned client and server are the same VS Code release and commit shape', () => {
	assert.doesNotThrow(() => assertPinsAgree(SERVER_PIN));
	assert.match(SERVER_PIN.server.commit, /^[0-9a-f]{40}$/);
	assert.throws(() => assertPinsAgree({ ...SERVER_PIN, client: { ...SERVER_PIN.client, vscode: '1.142.0' } }), /skew/);
	assert.throws(() => assertPinsAgree({ ...SERVER_PIN, server: { ...SERVER_PIN.server, commit: 'abc' } }), /commit/);
});

test('upstream digests are GitHub release digests, one per supported platform', () => {
	for (const platform of ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']) {
		assert.match(SERVER_PIN.server.upstream[platform]?.sha256 ?? '', /^[0-9a-f]{64}$/, platform);
	}
	assert.equal(SERVER_PIN.server.upstream['linux-x64'].sha256, '5d63f26c5dabc2acd29610b9b27f413b016aa67019e2cfcdf54031625e18f535');
});

test('an artifact is verified before use, and a tampered one is refused', () => {
	const dir = mkdtempSync(join(tmpdir(), 'osio-pin-'));
	try {
		const file = join(dir, 'a.tgz');
		writeFileSync(file, 'server bytes');
		const digest = sha256File(file);
		assert.doesNotThrow(() => verifyArtifact(file, digest));
		writeFileSync(file, 'server bytes, tampered');
		assert.throws(() => verifyArtifact(file, digest), /sha256 mismatch/);
		assert.throws(() => verifyArtifact(file, 'not-a-digest'), /sha256/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

function fakeServerTree(root) {
	for (const ext of ['git', 'git-base', 'ms-vscode.js-debug', 'typescript-language-features', 'copilot', 'mermaid-markdown-features']) {
		mkdirSync(join(root, 'vscode', 'extensions', ext), { recursive: true });
		writeFileSync(join(root, 'vscode', 'extensions', ext, 'package.json'), `{"name":"${ext}"}`);
	}
	mkdirSync(join(root, 'vscode', 'out'), { recursive: true });
	writeFileSync(join(root, 'vscode', 'out', 'server-main.js'), '// server');
	writeFileSync(join(root, 'node'), 'node binary');
}

test('the slim server is reproducible, drops the unwanted built-ins and keeps the needed ones', () => {
	const dir = mkdtempSync(join(tmpdir(), 'osio-slim-'));
	try {
		fakeServerTree(join(dir, 'lib'));
		const first = packSlimServer({ libDir: join(dir, 'lib'), outFile: join(dir, 'one.tgz') });
		const second = packSlimServer({ libDir: join(dir, 'lib'), outFile: join(dir, 'two.tgz') });
		assert.equal(first.sha256, second.sha256);
		const listing = execFileSync('tar', ['-tzf', join(dir, 'one.tgz')], { encoding: 'utf8' });
		assert.doesNotMatch(listing, /extensions\/(copilot|mermaid-markdown-features)\//);
		assert.match(listing, /extensions\/git\//);
		assert.match(listing, /vscode\/out\/server-main\.js/);
		rmSync(join(dir, 'lib', 'vscode', 'extensions', 'ms-vscode.js-debug'), { recursive: true });
		assert.throws(() => packSlimServer({ libDir: join(dir, 'lib'), outFile: join(dir, 'three.tgz') }), /ms-vscode\.js-debug/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
