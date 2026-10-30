/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-node-cap.test.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The node capability is the browser's only credential for a connected machine (devil verdict
// 2026-10-30, C6): bound to one user and one node, at most 15 minutes and never past the IDE
// token that asked for it, and no other IDE credential verifies as it (or it as them).

import test from 'node:test';
import assert from 'node:assert/strict';

import { signIdeToken, signNodeCap, signPreviewCap, verifyIdeToken, verifyNodeCap, verifyPreviewCap } from '../../scripts/ide-token.mjs';

const SECRET = 'k'.repeat(32);
const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const WS = 'cccccccc-3333-4333-8333-cccccccccccc';
const NOW = Date.parse('2026-10-30T12:00:00Z');
const NOW_S = Math.floor(NOW / 1000);

test('a node capability round-trips its user, node and expiry', () => {
	const { cap, exp } = signNodeCap({ userId: USER, node: 'laptop', secret: SECRET, parentExp: NOW_S + 900, now: NOW });
	assert.match(cap, /^nc1\./);
	assert.deepEqual(verifyNodeCap(cap, { secret: SECRET }, NOW), { userId: USER, node: 'laptop', iat: NOW_S, exp });
});

test('it never outlives 15 minutes nor the IDE token that minted it', () => {
	assert.equal(signNodeCap({ userId: USER, node: 'vm', secret: SECRET, parentExp: NOW_S + 9999, now: NOW }).exp, NOW_S + 900);
	assert.equal(signNodeCap({ userId: USER, node: 'vm', secret: SECRET, parentExp: NOW_S + 60, now: NOW }).exp, NOW_S + 60);
	assert.throws(() => signNodeCap({ userId: USER, node: 'vm', secret: SECRET, parentExp: NOW_S, now: NOW }), { status: 401 });
});

test('an expired or tampered capability is refused', () => {
	const { cap, exp } = signNodeCap({ userId: USER, node: 'vm', secret: SECRET, parentExp: NOW_S + 900, now: NOW });
	assert.throws(() => verifyNodeCap(cap, { secret: SECRET }, exp * 1000), { status: 401 });
	const [version, payload, mac] = cap.split('.');
	const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), node: 'other' })).toString('base64url');
	assert.throws(() => verifyNodeCap(`${version}.${forged}.${mac}`, { secret: SECRET }, NOW), { status: 401 });
	assert.throws(() => verifyNodeCap(cap, { secret: 'x'.repeat(32) }, NOW), { status: 401 });
});

test('a node id is a short lowercase name, nothing a path or header could misread', () => {
	for (const node of ['', 'Laptop', '../vm', 'vm/x', 'a b', 'vm\n', 'x'.repeat(64), 7]) {
		assert.throws(() => signNodeCap({ userId: USER, node, secret: SECRET, parentExp: NOW_S + 900, now: NOW }), { status: 400 }, String(node));
	}
});

test('no other IDE credential verifies as a node capability, nor it as them', () => {
	const ide = signIdeToken({ userId: USER, workspaceId: WS, secret: SECRET, now: NOW }).token;
	const preview = signPreviewCap({ userId: USER, workspaceId: WS, port: 3000, secret: SECRET, parentExp: NOW_S + 900, now: NOW }).cap;
	const node = signNodeCap({ userId: USER, node: 'vm', secret: SECRET, parentExp: NOW_S + 900, now: NOW }).cap;
	assert.throws(() => verifyNodeCap(ide, { secret: SECRET }, NOW), { status: 401 });
	assert.throws(() => verifyNodeCap(preview, { secret: SECRET }, NOW), { status: 401 });
	assert.throws(() => verifyIdeToken(node, { secret: SECRET }, NOW), { status: 401 });
	assert.throws(() => verifyPreviewCap(node, { secret: SECRET }, NOW), { status: 401 });
	// Same payload bytes under another version tag still fail: the key is derived per kind.
	const [, payload, mac] = node.split('.');
	assert.throws(() => verifyPreviewCap(`pc1.${payload}.${mac}`, { secret: SECRET }, NOW), { status: 401 });
});
