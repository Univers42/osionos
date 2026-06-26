/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-summon.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 18:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 18:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase 5 gate (AOC §7): a summon is consent-gated. The consent store resolves
 * the requester's reply ONLY when the user answers, a superseding summon
 * auto-declines the prior, and a TTL/timeout declines an ignored one. (The
 * request/reply wire synthesis itself is covered by collab-transport.test.ts.)
 */

import assert from 'node:assert/strict';
import test from 'node:test';

test('answer resolves the pending summon and clears it', async () => {
  const { useSummonStore } = await import('@/features/collab/store/useSummonStore');
  useSummonStore.setState({ incoming: null });
  let answered: boolean | null = null;
  useSummonStore.getState().present({ fromId: 'bob', route: '/p1', resolve: (a) => { answered = a; } });
  assert.equal(useSummonStore.getState().incoming?.fromId, 'bob');
  useSummonStore.getState().answer(true);
  assert.equal(answered, true, 'requester told accepted only on explicit answer');
  assert.equal(useSummonStore.getState().incoming, null, 'prompt cleared');
});

test('a superseding summon auto-declines the prior one (no hang)', async () => {
  const { useSummonStore } = await import('@/features/collab/store/useSummonStore');
  useSummonStore.setState({ incoming: null });
  let first: boolean | null = null;
  let second: boolean | null = null;
  useSummonStore.getState().present({ fromId: 'amy', route: '/a', resolve: (a) => { first = a; } });
  useSummonStore.getState().present({ fromId: 'zoe', route: '/z', resolve: (a) => { second = a; } });
  assert.equal(first, false, 'the older request is auto-declined, never left dangling');
  assert.equal(useSummonStore.getState().incoming?.fromId, 'zoe');
  useSummonStore.getState().answer(false);
  assert.equal(second, false);
});

test('resolvePending only fires for the matching sender (TTL safety)', async () => {
  const { useSummonStore } = await import('@/features/collab/store/useSummonStore');
  useSummonStore.setState({ incoming: null });
  let answered: boolean | null = null;
  useSummonStore.getState().present({ fromId: 'bob', route: '/p', resolve: (a) => { answered = a; } });
  useSummonStore.getState().resolvePending('someone-else', false);
  assert.equal(answered, null, 'a stale timer for a replaced summon is ignored');
  useSummonStore.getState().resolvePending('bob', false);
  assert.equal(answered, false, 'the matching TTL declines');
  assert.equal(useSummonStore.getState().incoming, null);
});

test('a declined summon defaults accepted=false (consent required)', async () => {
  const { useSummonStore } = await import('@/features/collab/store/useSummonStore');
  useSummonStore.setState({ incoming: null });
  let answered: boolean | null = null;
  useSummonStore.getState().present({ fromId: 'bob', route: '/p', resolve: (a) => { answered = a; } });
  useSummonStore.getState().answer(false);
  assert.equal(answered, false, 'no consent → not accepted; the user is never moved');
});
