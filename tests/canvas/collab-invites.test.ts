/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-invites.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase 7 gate (AOC §invites): the pure invite projections — only connections
 * who are not already members and have no pending request are invitable, and the
 * pending queue is ordered FIFO. (The owner-gated endpoints are covered by the
 * bridge test collab-rtc.test.mjs.)
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { invitableConnections, pendingInOrder, type Connection } from '@/features/collab/model/inviteState';
import type { JoinRequest } from '@/features/collab/api/collabInvites';

const connections: Connection[] = [
  { userId: 'a', name: 'Amy' },
  { userId: 'b', name: 'Bob' },
  { userId: 'c', name: 'Cy' },
  { userId: 'b', name: 'Bob dup' }, // duplicate in the source list
];

test('invitableConnections excludes members and pending requesters', () => {
  const pending: JoinRequest[] = [{ id: 'r1', requesterId: 'c', requesterName: 'Cy' }];
  const out = invitableConnections(connections, ['a'], pending);
  assert.deepEqual(out.map((c) => c.userId), ['b'], 'a is a member, c is pending, b dedup → only b');
});

test('invitableConnections returns everyone when none are blocked', () => {
  const out = invitableConnections(connections, [], []);
  assert.deepEqual(out.map((c) => c.userId), ['a', 'b', 'c'], 'dedup preserved, order stable');
});

test('pendingInOrder sorts oldest-first (FIFO)', () => {
  const reqs: JoinRequest[] = [
    { id: '2', requesterId: 'z', requesterName: 'Z', createdAt: '2026-06-26T10:00:00Z' },
    { id: '1', requesterId: 'y', requesterName: 'Y', createdAt: '2026-06-26T09:00:00Z' },
  ];
  assert.deepEqual(pendingInOrder(reqs).map((r) => r.id), ['1', '2']);
});
