/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-client-pin.test.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE client's VS Code packages move only with the server pin (devil verdict 2026-10-30, C1):
// a range or a stray version would let the client drift from the server commit it must match.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SERVER_PIN, clientPinViolations } from '../../packages/osionos-node/pin.mjs';

const appManifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('every VS Code package in the app is pinned exactly to the client pin (C1)', () => {
	const deps = { ...appManifest.dependencies, ...appManifest.devDependencies };
	assert.ok(Object.keys(deps).some((name) => name.startsWith('@codingame/')), 'the app depends on the client library');
	assert.deepEqual(clientPinViolations(deps, SERVER_PIN), []);
	assert.deepEqual(clientPinViolations({ '@codingame/monaco-vscode-api': '^37.6.1' }, SERVER_PIN), ['@codingame/monaco-vscode-api@^37.6.1']);
	assert.deepEqual(clientPinViolations({ 'monaco-editor': 'npm:@codingame/monaco-vscode-editor-api@37.6.0' }, SERVER_PIN), ['monaco-editor@npm:@codingame/monaco-vscode-editor-api@37.6.0']);
	assert.deepEqual(clientPinViolations({ 'monaco-editor': '0.56.0' }, SERVER_PIN), [], 'the upstream editor is not the client library');
});
