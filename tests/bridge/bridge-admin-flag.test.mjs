// The admin flag read shared by the users console refusal, the admin gate and the moderation
// target check (RULING-296 A296-8). A user_id can hold more than one identity row; a `limit=1`
// read answered from whichever row came first, so a flag on the second row was missed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasAdminFlag } from '../../scripts/bridge-roles.mjs';

const USER = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const OTHER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

/** A reader over identity rows that applies the user_id filter and the limit, as PostgREST does. */
function identityReader(rows) {
	const paths = [];
	const get = async (path) => {
		paths.push(path);
		const params = new URL(path, 'http://baas.local/').searchParams;
		const mine = rows.filter((row) => `eq.${row.user_id}` === params.get('user_id'));
		const flagged = params.get('is_admin') === 'is.true' ? mine.filter((row) => row.is_admin === true) : mine;
		return params.has('limit') ? flagged.slice(0, Number(params.get('limit'))) : flagged;
	};
	return { get, paths };
}

describe('hasAdminFlag', () => {
	it('is true when only the second identity row of the user is flagged', async () => {
		const reader = identityReader([{ user_id: USER, is_admin: false }, { user_id: USER, is_admin: true }]);
		assert.equal(await hasAdminFlag(reader, USER), true);
		assert.match(reader.paths[0], /^osionos_bridge_identities\?/);
	});

	it('is false when no row of the user is flagged, or there is no row', async () => {
		const rows = [{ user_id: USER, is_admin: false }, { user_id: OTHER, is_admin: true }];
		assert.equal(await hasAdminFlag(identityReader(rows), USER), false);
		assert.equal(await hasAdminFlag(identityReader([]), USER), false);
	});

	it('is false for an answer that is not a list', async () => {
		assert.equal(await hasAdminFlag({ get: async () => ({ is_admin: true }) }, USER), false);
	});

	it('rejects when the read fails, so each caller chooses its own refusal', async () => {
		await assert.rejects(hasAdminFlag({ get: async () => { throw new Error('down'); } }, USER), /down/);
	});

	it('sends the user id as one filter value, never as extra parameters', async () => {
		const reader = identityReader([]);
		await hasAdminFlag(reader, `${USER}&is_admin=is.true`);
		const params = new URL(reader.paths[0], 'http://baas.local/').searchParams;
		assert.deepEqual([...params.keys()].sort(), ['select', 'user_id']);
	});
});
