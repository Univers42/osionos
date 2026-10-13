/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-read.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	canChangePageSharing,
	canReadAsNonMember,
	canReadPageRow,
	canReadPageRowAsMember,
	isOwnerOrCollaborator,
	readablePageRows,
	withoutForeignSharingChanges,
} from '../../scripts/bridge-page-read.mjs';

const SELF = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

const VISIBILITIES = [null, 'private', 'shared', 'public', 'bogus'];
const OWNERS = { null: null, self: SELF, other: OTHER, 'self-UPPERCASE': SELF.toUpperCase() };
const COLLABORATORS = {
	null: null,
	'[]': [],
	'self+role': [{ userId: SELF, role: 'viewer' }],
	'self+null role': [{ userId: SELF, role: null }],
	other: [{ userId: OTHER, role: 'editor' }],
	'a string': JSON.stringify([{ userId: SELF, role: 'viewer' }]),
	'an object': { userId: SELF, role: 'viewer' },
	'[null]': [null],
};

// The ruling (U1(b)) in table terms, independent of the implementation.
function expectedRead(visibility, owner, collaborators) {
	return visibility === 'shared' || visibility === 'public'
		|| owner === 'self' || owner === 'self-UPPERCASE'
		|| collaborators === 'self+role';
}

describe('canReadPageRow — exhaustive visibility × owner × collaborators table', () => {
	for (const visibility of VISIBILITIES) {
		for (const [owner, ownerId] of Object.entries(OWNERS)) {
			for (const [collaborators, value] of Object.entries(COLLABORATORS)) {
				const expected = expectedRead(visibility, owner, collaborators);
				it(`visibility=${visibility} owner=${owner} collaborators=${collaborators} → ${expected}`, () => {
					const row = { id: 'p', workspace_id: 'w', visibility, owner_id: ownerId, collaborators: value };
					assert.equal(canReadPageRow(row, SELF), expected);
				});
			}
		}
	}
});

describe('canReadPageRow — identity and malformed input', () => {
	it('lets an owner whose token id is upper-case read their private page', () => {
		assert.equal(canReadPageRow({ visibility: 'private', owner_id: SELF }, SELF.toUpperCase()), true);
	});

	it('matches a collaborator id case-insensitively', () => {
		const row = { visibility: 'private', owner_id: OTHER, collaborators: [{ userId: SELF.toUpperCase(), role: 'viewer' }] };
		assert.equal(canReadPageRow(row, SELF), true);
	});

	it('has no legacy branch: an ownerless null-visibility page is readable by nobody', () => {
		assert.equal(canReadPageRow({ visibility: null, owner_id: null, collaborators: null }, SELF), false);
		assert.equal(canReadPageRow({ visibility: null, owner_id: null, collaborators: [] }, SELF), false);
	});

	it('never throws and denies on malformed rows or user ids', () => {
		const rows = [null, undefined, 'row', 42, [], { visibility: {} }, { owner_id: 5 }, Object.create(null),
			{ collaborators: [1, 'x', [], { userId: 5, role: 'x' }, { role: 'viewer' }] }, { owner_id: '' }];
		const userIds = [SELF, null, undefined, 5, '', {}];
		for (const row of rows) {
			for (const userId of userIds) assert.equal(canReadPageRow(row, userId), false, `${JSON.stringify(row)} / ${String(userId)}`);
		}
		assert.equal(canReadPageRow({ owner_id: '' }, ''), false, 'an empty owner never matches an empty user id');
	});
});

describe('readablePageRows', () => {
	it('keeps only readable rows and answers [] for a non-array result', () => {
		const rows = [{ id: 1, visibility: 'shared' }, { id: 2, visibility: 'private', owner_id: OTHER }, { id: 3, owner_id: SELF }];
		assert.deepEqual(readablePageRows(rows, SELF).map((row) => row.id), [1, 3]);
		assert.deepEqual(readablePageRows(null, SELF), []);
		assert.deepEqual(readablePageRows({ id: 1, visibility: 'public' }, SELF), []);
	});
});

describe('canReadAsNonMember — the marketplace rule (shared is NOT enough)', () => {
	it('reads public, owned or collaborated rows only', () => {
		assert.equal(canReadAsNonMember({ visibility: 'public', owner_id: OTHER }, SELF), true);
		assert.equal(canReadAsNonMember({ visibility: 'shared', owner_id: OTHER }, SELF), false);
		assert.equal(canReadAsNonMember({ visibility: 'private', owner_id: SELF }, SELF), true);
		assert.equal(canReadAsNonMember({ visibility: 'private', owner_id: OTHER, collaborators: [{ userId: SELF, role: 'viewer' }] }, SELF), true);
		assert.equal(canReadAsNonMember({ visibility: 'private', owner_id: null }, SELF), false);
	});
});

describe('canChangePageSharing — owner only, case-insensitive, never null', () => {
	const cases = [[null, false], [SELF, true], [OTHER, false], [SELF.toUpperCase(), true]];
	for (const [ownerId, expected] of cases) {
		it(`owner=${ownerId} → ${expected}`, () => assert.equal(canChangePageSharing({ owner_id: ownerId }, SELF), expected));
	}
	it('denies a null user and a malformed row', () => {
		assert.equal(canChangePageSharing({ owner_id: null }, null), false);
		assert.equal(canChangePageSharing(null, SELF), false);
	});
});

describe('withoutForeignSharingChanges — the PATCH guard', () => {
	const stored = { owner_id: OTHER, workspace_id: 'ws-1', visibility: null, collaborators: [{ userId: OTHER, role: 'owner' }] };

	it('passes an owner payload through untouched', () => {
		const payload = { visibility: 'public', collaborators: [], workspaceId: 'ws-2', title: 't' };
		assert.deepEqual(withoutForeignSharingChanges(payload, { ...stored, owner_id: SELF }, SELF), { payload, ignored: [] });
	});

	it('drops unchanged sharing keys from a non-owner without listing them', () => {
		const payload = { visibility: 'private', collaborators: [{ role: 'owner', userId: OTHER.toUpperCase() }], workspaceId: 'WS-1', content: [1] };
		assert.deepEqual(withoutForeignSharingChanges(payload, stored, SELF), { payload: { content: [1] }, ignored: [] });
	});

	it('drops and lists every changed sharing key, keeping the rest', () => {
		const payload = { visibility: 'shared', collaborators: [{ userId: SELF, role: 'editor' }], workspaceId: 'ws-2', title: 'x' };
		assert.deepEqual(withoutForeignSharingChanges(payload, stored, SELF), {
			payload: { title: 'x' },
			ignored: ['visibility', 'collaborators', 'workspaceId'],
		});
	});

	it('does not mutate the caller payload', () => {
		const payload = { visibility: 'shared', title: 'x' };
		withoutForeignSharingChanges(payload, stored, SELF);
		assert.deepEqual(payload, { visibility: 'shared', title: 'x' });
	});
});

describe('canReadPageRowAsMember — cross-workspace surfaces require membership too', () => {
	const WS = 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0';
	const page = (visibility, ownerId = OTHER) => ({ workspace_id: WS, visibility, owner_id: ownerId, collaborators: [] });
	const cases = [
		['a member, shared page', page('shared'), [WS], true],
		['a member, upper-case workspace id', page('shared'), [WS.toUpperCase()], true],
		['a member, another member\'s private page', page('private'), [WS], false],
		['a non-member, shared page', page('shared'), [], false],
		['a non-member, public page', page('public'), ['dddddddd-4444-4444-8444-dddddddddddd'], false],
		['a non-member, own private page', page('private', SELF), [], false],
		['a malformed row', null, [WS], false],
		['a row without a workspace', { visibility: 'public', owner_id: SELF }, [WS], false],
	];
	for (const [name, row, memberWorkspaceIds, expected] of cases) {
		it(`${name} → ${expected}`, () => assert.equal(canReadPageRowAsMember(row, SELF, memberWorkspaceIds), expected));
	}
});

describe('isOwnerOrCollaborator — the agent reads only the caller\'s own and shared-with-them pages', () => {
	const cases = [
		['the owner', { visibility: 'private', owner_id: SELF }, true],
		['the owner, upper-case id', { visibility: 'private', owner_id: SELF.toUpperCase() }, true],
		['a collaborator with a role', { visibility: 'private', owner_id: OTHER, collaborators: [{ userId: SELF, role: 'viewer' }] }, true],
		['a collaborator without a role', { visibility: 'private', owner_id: OTHER, collaborators: [{ userId: SELF, role: null }] }, false],
		['another user\'s shared page', { visibility: 'shared', owner_id: OTHER }, false],
		['another user\'s public page', { visibility: 'public', owner_id: OTHER }, false],
		['an ownerless shared page', { visibility: 'shared', owner_id: null }, false],
		['a malformed row', null, false],
	];
	for (const [name, row, expected] of cases) {
		it(`${name} → ${expected}`, () => assert.equal(isOwnerOrCollaborator(row, SELF), expected));
	}
});
