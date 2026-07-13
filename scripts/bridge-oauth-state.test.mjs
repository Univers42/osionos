/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-oauth-state.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Offline unit check for the Connections OAuth signed-state primitive — the
 * security anchor of the Google connect flow (the browser callback has no
 * Authorization header, so a forged/expired state must NOT verify). Node-only,
 * no env/network:
 *
 *   docker run --rm -v "$PWD":/app -w /app node:22-alpine \
 *     node --test scripts/bridge-oauth-state.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { signOAuthState, verifyOAuthState } from './bridge-api.mjs';

const config = { appSessionSecret: 'unit-test-secret-do-not-use-in-prod' };
const OWNER = '11111111-1111-4111-8111-111111111111';
const future = () => Math.floor(Date.now() / 1000) + 600;

test('roundtrips a valid state', () => {
	const payload = { sub: OWNER, app: 'gmail', rt: 'https://localhost:3001/', exp: future() };
	const verified = verifyOAuthState(signOAuthState(payload, config), config);
	assert.equal(verified.sub, OWNER);
	assert.equal(verified.app, 'gmail');
	assert.equal(verified.rt, 'https://localhost:3001/');
});

test('rejects a tampered signature', () => {
	const token = signOAuthState({ sub: OWNER, app: 'gmail', rt: 'x', exp: future() }, config);
	const [body] = token.split('.');
	assert.throws(() => verifyOAuthState(`${body}.deadbeef`, config), /signature is invalid/);
});

test('rejects a state signed with a different secret', () => {
	const token = signOAuthState({ sub: OWNER, app: 'gmail', rt: 'x', exp: future() }, { appSessionSecret: 'attacker' });
	assert.throws(() => verifyOAuthState(token, config), /signature is invalid/);
});

test('rejects an expired state', () => {
	const token = signOAuthState({ sub: OWNER, app: 'gmail', rt: 'x', exp: Math.floor(Date.now() / 1000) - 1 }, config);
	assert.throws(() => verifyOAuthState(token, config), /expired/);
});

test('rejects an unknown app id', () => {
	const token = signOAuthState({ sub: OWNER, app: 'not-a-google-app', rt: 'x', exp: future() }, config);
	assert.throws(() => verifyOAuthState(token, config), /payload is invalid/);
});

test('rejects a non-uuid subject', () => {
	const token = signOAuthState({ sub: 'not-a-uuid', app: 'gmail', rt: 'x', exp: future() }, config);
	assert.throws(() => verifyOAuthState(token, config), /payload is invalid/);
});
