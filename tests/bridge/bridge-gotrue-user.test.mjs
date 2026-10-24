/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-gotrue-user.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * findAccountByEmail against a GoTrue admin-list fake: the exact match among containing
 * accounts, the confirmation flag, the full-page rule and the failure shape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findAccountByEmail, readGotrueUser } from '../../scripts/bridge-gotrue-user.mjs';

const config = { baasUrl: 'http://grobase.test', serviceKey: 'service' };
const user = (email, extra = {}) => ({ id: `id-${email}`, email, email_confirmed_at: '2026-10-01T00:00:00Z', ...extra });
const listing = (users, { status = 200, urls = [] } = {}) => async (url) => {
	urls.push(String(url));
	return new Response(JSON.stringify({ users }), { status, headers: { 'content-type': 'application/json' } });
};
const find = (fetchImpl, address, options) => findAccountByEmail({ config, fetchImpl }, address, options);

describe('findAccountByEmail', () => {
	it('G1 keeps only the exact case-insensitive match and asks for per_page', async () => {
		const urls = [];
		const result = await find(listing([user('xdylan@gmail.com'), user('Dylan@Gmail.com'), user('dylan@gmail.com.au')], { urls }), ' dylan@gmail.com ');
		assert.deepEqual(result, { account: { id: 'id-Dylan@Gmail.com', emailConfirmed: true }, complete: true });
		assert.match(urls[0], /\/auth\/v1\/admin\/users\?filter=dylan%40gmail\.com&per_page=50$/);
		assert.deepEqual(await find(listing([user('xdylan@gmail.com')]), 'dylan@gmail.com'), { account: null, complete: true });
	});

	it('G2 reads emailConfirmed from email_confirmed_at', async () => {
		for (const [value, confirmed] of [['2026-10-01T00:00:00Z', true], [null, false], ['', false], [undefined, false]]) {
			const { account } = await find(listing([user('a@b.co', { email_confirmed_at: value })]), 'a@b.co');
			assert.equal(account.emailConfirmed, confirmed, String(value));
		}
	});

	it('G3 a full page with no exact match is incomplete, never absent', async () => {
		const page = Array.from({ length: 50 }, (_, index) => user(`x${index}a@b.co`));
		assert.deepEqual(await find(listing(page), 'a@b.co'), { account: null, complete: false });
		const hit = await find(listing([...page.slice(1), user('a@b.co')]), 'a@b.co');
		assert.equal(hit.account.id, 'id-a@b.co', 'a match on a full page decides');
		assert.deepEqual(await find(listing(page.slice(0, 3)), 'a@b.co', { perPage: 3 }), { account: null, complete: false });
	});

	it('G4 any failure is gotrue_lookup_failed, and readGotrueUser keeps its own code', async () => {
		const cases = {
			'non-2xx': listing([], { status: 500 }),
			'network': async () => { throw new Error('down'); },
			'bad body': async () => new Response('not json', { status: 200 }),
		};
		for (const [name, fetchImpl] of Object.entries(cases)) {
			const error = await find(fetchImpl, 'a@b.co').catch((e) => e);
			assert.deepEqual([error.status, error.code], [503, 'gotrue_lookup_failed'], name);
		}
		assert.equal((await findAccountByEmail({ config: {}, fetchImpl: listing([]) }, 'a@b.co').catch((e) => e)).code, 'gotrue_lookup_failed');
		assert.equal((await readGotrueUser({ config, fetchImpl: listing([], { status: 404 }) }, 'u').catch((e) => e)).code, 'gotrue_read_failed');
	});
});
