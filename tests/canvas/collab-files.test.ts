/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-files.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase 6 gate (AOC §4): file seeding ENFORCES the ephemeral/durable split — the
 * bytes persist durably FIRST, and only on success is a reference announced over
 * realtime, carrying NO bytes; a failed upload announces nothing. The feed
 * reducers fold announces into a capped, self-excluded feed + current-files view.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { seedSharedFile, type UploadableFile, type SeededFileRef } from '@/features/collab/model/seedSharedFile';
import { appendAnnounce, filesFromFeed, ANNOUNCE_CAP, type DurableAnnounce } from '@/features/collab/model/sharedAnnounces';
import type { CollabEvent } from '@/features/collab/model/realtimeTransport.port';

const FILE: UploadableFile = { name: 'spec.pdf', type: 'application/pdf', size: 1024 };

test('seedSharedFile persists durably FIRST, then announces a reference (no bytes)', async () => {
  const order: string[] = [];
  const broadcasts: CollabEvent[] = [];
  const ref: SeededFileRef = { fileId: 'key/abc.pdf', name: 'spec.pdf' };
  await seedSharedFile('space-1', FILE, {
    selfId: 'me',
    upload: async () => { order.push('upload'); return ref; },
    broadcast: (e) => { order.push('broadcast'); broadcasts.push(e); },
  });
  assert.deepEqual(order, ['upload', 'broadcast'], 'durable persist precedes the announce');
  assert.equal(broadcasts.length, 1);
  const announce = broadcasts[0];
  assert.equal(announce.t, 'file');
  assert.deepEqual(Object.keys(announce).sort(), ['actor', 'fileId', 'name', 'op', 't'].sort(),
    'announce carries only a reference — no bytes/content/data field (AOC §4)');
  if (announce.t === 'file') assert.equal(announce.fileId, 'key/abc.pdf');
});

test('a failed durable upload announces NOTHING (no phantom file on peers)', async () => {
  const broadcasts: CollabEvent[] = [];
  await assert.rejects(seedSharedFile('space-1', FILE, {
    selfId: 'me',
    upload: async () => { throw new Error('storage down'); },
    broadcast: (e) => broadcasts.push(e),
  }), /storage down/);
  assert.equal(broadcasts.length, 0, 'no announce when the durable write fails');
});

test('appendAnnounce keeps only durable note/file, excludes self, caps length', () => {
  let feed: DurableAnnounce[] = [];
  feed = appendAnnounce(feed, { t: 'caret', actor: 'bob', seq: 1, caret: { blockId: 'b', offset: 0 } }, 'me');
  assert.equal(feed.length, 0, 'cursor events are not durable announces');
  feed = appendAnnounce(feed, { t: 'file', actor: 'me', fileId: 'x', op: 'seeded', name: 'mine' }, 'me');
  assert.equal(feed.length, 0, 'own announce excluded');
  for (let i = 0; i < ANNOUNCE_CAP + 10; i += 1) {
    feed = appendAnnounce(feed, { t: 'file', actor: 'bob', fileId: `f${i}`, op: 'seeded', name: `f${i}` }, 'me');
  }
  assert.equal(feed.length, ANNOUNCE_CAP, 'feed is capped');
});

test('filesFromFeed projects current files (removed deletes)', () => {
  const feed: DurableAnnounce[] = [
    { t: 'file', actor: 'bob', fileId: 'a', op: 'seeded', name: 'A' },
    { t: 'file', actor: 'amy', fileId: 'b', op: 'seeded', name: 'B' },
    { t: 'note', actor: 'bob', noteId: 'n', op: 'created', anchor: { blockId: 'b1' } },
    { t: 'file', actor: 'bob', fileId: 'a', op: 'removed', name: 'A' },
  ];
  const files = filesFromFeed(feed);
  assert.deepEqual(files.map((f) => f.fileId), ['b'], 'A removed; notes are not files');
  assert.equal(files[0].by, 'amy');
});
