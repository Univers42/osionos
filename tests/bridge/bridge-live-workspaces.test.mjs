/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-live-workspaces.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { liveReadableWorkspaces, privateWorkspaceOf } from '../../scripts/bridge-live-workspaces.mjs';

/**
 * The live-membership rule (C98): a workspace counts when it is the caller's
 * own private workspace, or when the LIVE members table holds a row for it.
 * The token's member list is not an input of the function at all — a member
 * whose row is gone loses the workspace at once.
 */

const HOME = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const TEAM = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const OTHER = 'cccccccc-3333-4333-8333-cccccccccccc';

describe('liveReadableWorkspaces', () => {
	it('counts the private workspace of the token, whatever the members table says', () => {
		assert.deepEqual(liveReadableWorkspaces({ privateWorkspaceId: HOME, memberWorkspaces: [] }), [HOME]);
	});

	it('counts the live member rows, and only those', () => {
		const workspaces = liveReadableWorkspaces({
			privateWorkspaceId: HOME,
			memberWorkspaces: [{ workspace_id: TEAM }],
		});
		assert.deepEqual(workspaces.sort(), [HOME, TEAM].sort());
	});

	it('drops the member row at once: the workspace is gone in the same call', () => {
		const before = liveReadableWorkspaces({ privateWorkspaceId: HOME, memberWorkspaces: [{ workspace_id: TEAM }] });
		const after = liveReadableWorkspaces({ privateWorkspaceId: HOME, memberWorkspaces: [] });
		assert.ok(before.includes(TEAM));
		assert.ok(!after.includes(TEAM), 'the removed membership ends at once');
	});

	it('accepts the member rows as ids as well as rows', () => {
		assert.deepEqual(
			liveReadableWorkspaces({ privateWorkspaceId: HOME, memberWorkspaces: [TEAM] }),
			[HOME, TEAM],
		);
	});

	it('intersects the scope, and never widens it', () => {
		const workspaces = liveReadableWorkspaces({
			privateWorkspaceId: HOME,
			memberWorkspaces: [{ workspace_id: TEAM }],
			scope: [TEAM],
		});
		assert.deepEqual(workspaces, [TEAM], 'the private workspace is out of the scope');
	});

	it('drops what is not a uuid, and never throws on a malformed row', () => {
		const workspaces = liveReadableWorkspaces({
			privateWorkspaceId: 'not-a-uuid',
			memberWorkspaces: [null, { workspace_id: 42 }, { workspace_id: TEAM }, 'x'],
		});
		assert.deepEqual(workspaces, [TEAM]);
	});

	it('lower-cases the ids, so the comparison is the same one everywhere', () => {
		const workspaces = liveReadableWorkspaces({
			privateWorkspaceId: HOME.toUpperCase(),
			memberWorkspaces: [{ workspace_id: TEAM.toUpperCase() }],
		});
		assert.deepEqual(workspaces.sort(), [HOME, TEAM].sort());
	});
});

describe('privateWorkspaceOf', () => {
	it('is the workspace the token signs with the role owner', () => {
		assert.equal(
			privateWorkspaceOf({ workspaceIds: [TEAM, HOME], roles: { [HOME]: 'owner', [TEAM]: 'member' } }),
			HOME,
		);
	});

	it('falls back to the first workspace when the token carries no owner', () => {
		assert.equal(privateWorkspaceOf({ workspaceIds: [TEAM], roles: { [TEAM]: 'member' } }), TEAM);
	});

	it('is empty when the token carries no workspace at all', () => {
		assert.equal(privateWorkspaceOf({ workspaceIds: [], roles: {} }), '');
	});
});
