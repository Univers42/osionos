/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-profile-status.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



// The user-set status (emoji, text, expiry, busy): the PATCH that sets and clears it, its
// validation table, the lazy expiry, and the card a viewer gets.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { send, sessionToken, startAccountWorld, USER_A, USER_B } from './support/account-world.mjs';

const HOUR_MS = 3_600_000;
const inAnHour = () => new Date(Date.now() + HOUR_MS).toISOString();
const anHourAgo = () => new Date(Date.now() - HOUR_MS).toISOString();
const STATUS_PATH = '/api/account/profile/status';

function profileOf(userId, overrides = {}) {
	return {
		user_id: userId, display_name: 'Ada Lovelace', username: userId === USER_A ? 'ada' : 'bob', version: 1,
		status_emoji: null, status_text: null, status_expires_at: null, status_busy: false,
		directory_opt_out: false, ...overrides,
	};
}

async function world(t, profile = {}, extra = {}) {
	const built = await startAccountWorld(t, { rows: { profiles: [profileOf(USER_A, profile), profileOf(USER_B)], ...extra } });
	const token = sessionToken(built.config, USER_A);
	const patch = (body, headers) => send(built.base, STATUS_PATH, { method: 'PATCH', token, body, headers });
	const row = () => built.store.rows('osionos_profiles').find((candidate) => candidate.user_id === USER_A);
	return { ...built, token, patch, row };
}

describe('PATCH /api/account/profile/status', () => {
	it('sets the four fields and answers them with the bumped version as an ETag', async (t) => {
		const { patch, row } = await world(t);
		const expiresAt = inAnHour();
		const answer = await patch({ emoji: '🌴', text: 'On holiday', expiresAt, busy: true });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { emoji: '🌴', text: 'On holiday', expiresAt, busy: true });
		assert.equal(answer.headers.get('etag'), '"2"');
		assert.deepEqual([row().status_emoji, row().status_text, row().status_busy], ['🌴', 'On holiday', true]);
	});

	it('writes through the account role, filtered to the caller\'s own row', async (t) => {
		const { patch, store } = await world(t);
		await patch({ text: 'Heads down' });
		const write = store.callsTo('osionos_profiles').find((call) => call.method === 'PATCH');
		assert.match(write.authorization, /^Bearer ey/);
		assert.equal(write.claims.role, 'osionos_account_user');
		assert.equal(write.params.get('user_id'), `eq.${USER_A}`);
	});

	it('leaves another user\'s status alone', async (t) => {
		const { patch, store } = await world(t);
		await patch({ text: 'Heads down' });
		assert.equal(store.rows('osionos_profiles').find((row) => row.user_id === USER_B).status_text, null);
	});

	for (const cleared of [null, '']) {
		it(`clears a field set to ${JSON.stringify(cleared)}`, async (t) => {
			const { patch, row } = await world(t, { status_emoji: '🌴', status_text: 'Away', status_expires_at: inAnHour() });
			const answer = await patch({ emoji: cleared, text: cleared, expiresAt: cleared });
			assert.equal(answer.status, 200);
			assert.deepEqual([row().status_emoji, row().status_text, row().status_expires_at], [null, null, null]);
		});
	}

	it('resets the expiry when a new text arrives without one', async (t) => {
		const { patch, row } = await world(t, { status_text: 'Old', status_expires_at: inAnHour() });
		await patch({ text: 'New' });
		assert.equal(row().status_expires_at, null);
	});

	it('keeps busy when only the text changes', async (t) => {
		const { patch, row } = await world(t, { status_busy: true });
		await patch({ text: 'Still busy' });
		assert.equal(row().status_busy, true);
	});

	const invalid = [
		['an emoji of 9 characters', { emoji: '123456789' }, 'invalid_emoji'],
		['an emoji that is not a string', { emoji: 5 }, 'invalid_emoji'],
		['a text of 121 characters', { text: 'x'.repeat(121) }, 'invalid_text'],
		['a text that is not a string', { text: ['a'] }, 'invalid_text'],
		['an expiry in the past', { expiresAt: anHourAgo() }, 'invalid_expires_at'],
		['an expiry that is not a date', { expiresAt: 'tomorrow-ish' }, 'invalid_expires_at'],
		['an expiry that is a number', { expiresAt: 4102444800000 }, 'invalid_expires_at'],
		['a busy flag that is not a boolean', { busy: 'yes' }, 'invalid_busy'],
		['a field nobody knows', { text: 'ok', admin: true }, 'unknown_field'],
		['an empty body', {}, 'empty_update'],
	];
	for (const [label, body, code] of invalid) {
		it(`refuses ${label} with 422 ${code} and writes nothing`, async (t) => {
			const { patch, store } = await world(t);
			const answer = await patch(body);
			assert.equal(answer.status, 422);
			assert.equal(answer.body.code, code);
			assert.equal(store.callsTo('osionos_profiles').filter((call) => call.method === 'PATCH').length, 0);
		});
	}

	it('accepts an emoji of exactly 8 code points and a text of exactly 120', async (t) => {
		const { patch } = await world(t);
		assert.equal((await patch({ emoji: '🌴'.repeat(8), text: 'x'.repeat(120) })).status, 200);
	});

	const malformed = [
		['a body that is not JSON', '{nope', 400],
		['a body that is an array', '[1]', 422],
	];
	for (const [label, raw, status] of malformed) {
		it(`refuses ${label} with ${status}`, async (t) => {
			const { base, token } = await world(t);
			const answer = await send(base, STATUS_PATH, { method: 'PATCH', token, headers: { 'content-type': 'application/json' }, body: undefined });
			assert.equal(answer.status, 422, 'no body at all is an empty update');
			const response = await fetch(`${base}${STATUS_PATH}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: raw });
			assert.equal(response.status, status);
		});
	}

	it('answers 401 without a bearer token', async (t) => {
		const { base } = await world(t);
		assert.equal((await send(base, STATUS_PATH, { method: 'PATCH', body: { text: 'x' } })).status, 401);
	});

	it('answers 405 to a method it does not serve', async (t) => {
		const { base, token } = await world(t);
		assert.equal((await send(base, STATUS_PATH, { method: 'GET', token })).status, 405);
	});

	it('answers 429 after 30 writes in a minute', async (t) => {
		const { patch } = await world(t);
		for (let at = 0; at < 30; at += 1) assert.equal((await patch({ text: `t${at}` })).status, 200);
		assert.equal((await patch({ text: 'one too many' })).status, 429);
	});
});

describe('the status on the public card', () => {
	const lookup = (base, token) => send(base, '/api/users/ada', { token });

	it('carries the status of a person who set one', async (t) => {
		const expires = inAnHour();
		const { base, config } = await world(t, { status_emoji: '🌴', status_text: 'Away', status_expires_at: expires, status_busy: true });
		const answer = await lookup(base, sessionToken(config, USER_B));
		assert.deepEqual(answer.body.status, { emoji: '🌴', text: 'Away', expiresAt: expires, busy: true });
	});

	it('is null when none is set', async (t) => {
		const { base, config } = await world(t);
		assert.equal((await lookup(base, sessionToken(config, USER_B))).body.status, null);
	});

	it('is null once the expiry has passed, whatever the row still holds', async (t) => {
		const { base, config } = await world(t, { status_emoji: '🌴', status_text: 'Away', status_expires_at: anHourAgo() });
		assert.equal((await lookup(base, sessionToken(config, USER_B))).body.status, null);
	});

	it('is absent from the reduced card of a viewer the subject blocked', async (t) => {
		const { base, config } = await world(t, { status_text: 'Away' }, { blocks: [{ blocker_id: USER_A, blocked_id: USER_B }] });
		const answer = await lookup(base, sessionToken(config, USER_B));
		assert.equal(answer.status, 200);
		assert.equal(Object.hasOwn(answer.body, 'status'), false);
		assert.doesNotMatch(answer.text, /Away/);
	});

	it('is absent from the reduced card of a person who opted out of the directory', async (t) => {
		const { base, config } = await world(t, { status_text: 'Away', directory_opt_out: true });
		assert.equal(Object.hasOwn((await lookup(base, sessionToken(config, USER_B))).body, 'status'), false);
	});
});
