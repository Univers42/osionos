// A sharing write tells exactly the users it added or removed, by id, and nobody else.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collaboratorDiff, publishPageAccess } from '../../scripts/bridge-page-access-fanout.mjs';

const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const C = 'cccccccc-3333-4333-8333-cccccccccccc';
const people = (...ids) => ids.map((userId) => ({ userId, role: 'editor' }));

function recorder() {
	const frames = [];
	const fetchImpl = async (_url, init) => {
		frames.push(JSON.parse(init.body));
		return new Response('{}', { status: 200 });
	};
	return { frames, fetchImpl };
}

describe('collaboratorDiff', () => {
	it('names the added and the removed users and ignores the unchanged ones', () => {
		assert.deepEqual(collaboratorDiff(people(A, B), people(B, C)), { granted: [C], revoked: [A] });
	});

	it('compares ids case-insensitively and skips malformed entries', () => {
		assert.deepEqual(collaboratorDiff(people(A.toUpperCase()), [...people(A), null, { userId: 7 }]), { granted: [], revoked: [] });
	});

	it('treats a missing list as empty', () => {
		assert.deepEqual(collaboratorDiff(undefined, people(B)), { granted: [B], revoked: [] });
	});
});

describe('publishPageAccess', () => {
	it('publishes granted and revoked on each user topic with ids only', async () => {
		const { frames, fetchImpl } = recorder();
		await publishPageAccess({ workspaceId: 'ws1', pageId: 'p1', before: people(A, B), after: people(B, C), fetchImpl });
		assert.deepEqual(
			frames.map(({ topic, event_type: eventType, payload }) => ({ topic, eventType, payload })).sort((x, y) => x.topic.localeCompare(y.topic)),
			[
				{ topic: `user:${A}`, eventType: 'page_access', payload: { workspaceId: 'ws1', pageId: 'p1', op: 'revoked' } },
				{ topic: `user:${C}`, eventType: 'page_access', payload: { workspaceId: 'ws1', pageId: 'p1', op: 'granted' } },
			],
		);
	});

	it('publishes nothing when the list did not change', async () => {
		const { frames, fetchImpl } = recorder();
		await publishPageAccess({ workspaceId: 'ws1', pageId: 'p1', before: people(A), after: people(A), fetchImpl });
		assert.equal(frames.length, 0);
	});
});
