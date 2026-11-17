// The U5-1 predicate on its own: the viewer is never hidden from itself, ids are compared
// case-insensitively, a large set is read in chunks, and any failed read is a 503.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenAmong, hiddenFrom } from '../../scripts/bridge-hidden-from.mjs';
import { CONFIG, createFollowStore, uid } from './support/follow-postgrest.mjs';

const VIEWER = uid(1);

function store(world = {}) {
	return createFollowStore({ tables: { osionos_profiles: [] }, ...world });
}

describe('hiddenAmong', () => {
	it('never hides the viewer from itself, even when it opted out', async () => {
		const s = store({ tables: { osionos_profiles: [{ user_id: VIEWER, directory_opt_out: true }] } });
		assert.equal(await hiddenFrom(CONFIG, s.fetchImpl, VIEWER, VIEWER), false);
		assert.equal(s.calls.length, 0, 'no lookup for the viewer alone');
	});

	it('hides an opted-out subject and a block in either direction, whatever the id casing', async () => {
		const s = store({
			blocks: [{ blocker_id: VIEWER, blocked_id: uid(3) }, { blocker_id: uid(4), blocked_id: VIEWER }],
			tables: { osionos_profiles: [{ user_id: uid(2), directory_opt_out: true }, { user_id: uid(5), directory_opt_out: false }] },
		});
		const hidden = await hiddenAmong(CONFIG, s.fetchImpl, VIEWER.toUpperCase(), [2, 3, 4, 5, 6].map((n) => uid(n).toUpperCase()));
		assert.deepEqual([...hidden].sort(), [uid(2), uid(3), uid(4)]);
	});

	it('reads 120 subjects in chunks of at most 50 and one block list', async () => {
		const s = store();
		await hiddenAmong(CONFIG, s.fetchImpl, VIEWER, Array.from({ length: 120 }, (_, n) => uid(100 + n)));
		assert.equal(s.callsTo('osionos_user_blocks').length, 1);
		assert.equal(s.callsTo('osionos_profiles').length, 3);
	});

	it('answers 503 account_plane_unavailable, keeping the cause, when a read fails', async () => {
		const s = store({ failWhen: (name) => name === 'osionos_profiles' });
		await assert.rejects(hiddenFrom(CONFIG, s.fetchImpl, uid(2), VIEWER), (error) => error.status === 503 && error.code === 'account_plane_unavailable' && error.cause instanceof Error);
	});
});
