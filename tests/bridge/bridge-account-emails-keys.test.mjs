/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails-keys.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The key and table states of the secondary-email routes: GET lists what opens and says what
 * it skipped; a missing key, equal keys or a missing table each turn every mutating route
 * into 503 email_unavailable and leave the GET answering the primary with a flag.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailRows } from '../../scripts/bridge-account-email-rows.mjs';
import { CODE, createEmailWorld, goodEnv, MFA_KEY, PATH, SEAL_KEY, USER_A } from './support/email-world.mjs';

const UUID = '11111111-1111-4111-8111-111111111111';
const ROUTES = [['POST', PATH, { email: 'k@example.com' }], ['POST', `${PATH}/${UUID}/code`], ['POST', `${PATH}/${UUID}/verify`, { code: CODE }], ['DELETE', `${PATH}/${UUID}`]];
const sink = (t) => t.mock.method(console, 'error', () => {});

async function assertDown(world) {
	for (const [method, path, body] of ROUTES) {
		const result = await world.call(USER_A, { method, path, body });
		assert.deepEqual([result.status, result.body.code], [503, 'email_unavailable'], `${method} ${path}`);
	}
	assert.equal(world.grobase.requests.length, 0);
	const listed = await world.call(USER_A);
	assert.deepEqual([listed.status, listed.body.length, listed.body[0].isPrimary, listed.headers['x-emails-secondaries']], [200, 1, true, 'unavailable']);
}

describe('GET with secondaries', () => {
	it('B16 lists openable rows and skips an unopenable one and one whose HMAC does not match, saying so in an exposed header', async () => {
		const world = createEmailWorld();
		for (const name of ['a1', 'a2', 'a3']) await world.add(USER_A, `${name}@example.com`);
		world.table.rows[0].email_enc = 'not-sealed';
		world.table.rows[1].email_hmac = '0'.repeat(64);
		const result = await world.call(USER_A);
		assert.deepEqual([result.status, result.body.map((record) => record.email), result.headers['x-emails-skipped']], [200, ['a@example.com', 'a3@example.com'], '2']);
		assert.match(result.headers['access-control-expose-headers'], /x-emails-skipped/);
	});

	it('B30 opens a row sealed under the _PREVIOUS key', async () => {
		const world = createEmailWorld({ env: { ...goodEnv(), OSIONOS_EMAIL_SEAL_KEY: Buffer.alloc(32, 7).toString('base64'), OSIONOS_EMAIL_SEAL_KEY_PREVIOUS: SEAL_KEY } });
		await createEmailRows({ pg: world.table.pg, env: goodEnv() }).insert(USER_A, 'old@example.com');
		const result = await world.call(USER_A);
		assert.deepEqual(result.body.map((record) => record.email), ['a@example.com', 'old@example.com']);
	});
});

describe('keys and table', () => {
	it('B19 a missing seal key, lookup key or too short lookup key disables every mutating route', async () => {
		for (const patch of [{ OSIONOS_EMAIL_SEAL_KEY: undefined }, { OSIONOS_EMAIL_LOOKUP_KEY: undefined }, { OSIONOS_EMAIL_LOOKUP_KEY: 'short' }]) {
			await assertDown(createEmailWorld({ env: { ...goodEnv(), ...patch } }));
		}
	});

	it('B29 equal keys disable the routes and log one line that names the variables and holds no value', async (t) => {
		const cases = [{ OSIONOS_EMAIL_SEAL_KEY: MFA_KEY }, { OSIONOS_EMAIL_LOOKUP_KEY: SEAL_KEY }, { OSIONOS_EMAIL_LOOKUP_KEY: MFA_KEY }];
		for (const patch of cases) {
			const log = sink(t);
			const world = createEmailWorld({ env: { ...goodEnv(), ...patch } });
			await assertDown(world);
			const lines = log.mock.calls.map((call) => call.arguments.join(' ')).filter((line) => line.includes('account_emails_keys_shared'));
			assert.equal(lines.length, 1);
			assert.match(lines[0], /OSIONOS_/);
			assert.equal(lines[0].includes(SEAL_KEY) || lines[0].includes(MFA_KEY) || lines[0].includes('l'.repeat(40)), false);
			log.mock.restore();
		}
	});

	it('B21 a missing table (42P01 or PGRST205) is 503 email_unavailable on the four routes, never 500, and the GET flags it', async () => {
		for (const upstreamCode of ['42P01', 'PGRST205']) {
			const world = createEmailWorld();
			world.table.fail = () => ({ status: 404, upstreamStatus: 404, upstreamCode });
			await assertDown(world);
			assert.match((await world.call(USER_A)).headers['access-control-expose-headers'], /x-emails-secondaries/);
		}
	});
});
