import assert from 'node:assert/strict';
import test from 'node:test';
import { isolatedModule } from './fixtures/isolatedModule.ts';
import { broadcastsSuppressed, withoutBroadcast } from '../../src/store/sync/broadcastGuard.ts';
import { applyBlockOps, diffBlocks, nextBlockClock, recordBlockOps, splitBlockEvents, absorbBlockClock } from '../../src/features/collab/model/blockSync.ts';

const block = (content: string) => ({ id: 'b', type: 'paragraph', content });
const tick = () => new Promise((resolve) => setTimeout(resolve, 35));

test('server loads never broadcast blocks, local edits do, and persona tabs do not drop each other', async () => {
  let state: any = { pages: { space: [{ _id: 'page' }] }, pageById: () => state.pages.space[0], applyRemoteContent(_id: string, content: any) { write([{ _id: 'page', content }]); } };
  const subs = new Set<any>();
  const events: any[] = [];
  const inbound: any[] = [];
  const starts: any[] = [];
  let seq = 0;
  function write(pages: any[]) { const prev = state; state = { ...state, pages: { space: pages } }; for (const sub of subs) sub(state, prev); }
  const channel = { onEvent(fn: any) { inbound.push(fn); return () => {}; } };
  const bindings = {
    useEffect: (fn: any) => starts.push(fn),
    useCollabStore: Object.assign(() => channel, { getState: () => ({ broadcast: (e: any) => events.push(e), nextSeq: () => ++seq }) }),
    usePageStore: { subscribe(fn: any) { subs.add(fn); return () => subs.delete(fn); }, getState: () => state },
    broadcastsSuppressed, withoutBroadcast, applyBlockOps, diffBlocks, nextBlockClock, recordBlockOps, splitBlockEvents, absorbBlockClock,
    readLocalCaretAndSelection: () => ({}),
  };
  const tab1 = isolatedModule('src/features/collab/ui/useLiveBlockSync.ts', bindings);
  tab1.useLiveBlockSync('space', 'persona'); const stop1 = starts.pop()();
  write([{ _id: 'page', content: [block('loaded')] }]); await tick();
  assert.deepEqual(events, [], 'undefined-to-loaded is not a local edit');
  withoutBroadcast(() => write([{ _id: 'page', content: [block('server changed')] }])); await tick();
  assert.deepEqual(events, [], 'server refresh suppresses every outbound path');
  write([{ _id: 'page', content: [block('local')] }]); await tick();
  assert.equal(events[0].t, 'blocks');
  assert.match(events[0].actor, /^persona:/);
  const actor1 = events[0].actor;
  stop1();
  const tab2 = isolatedModule('src/features/collab/ui/useLiveBlockSync.ts', bindings);
  tab2.useLiveBlockSync('space', 'persona'); const stop2 = starts.pop()();
  write([{ _id: 'page', content: [block('tab2')] }]); await tick();
  assert.notEqual(events.at(-1).actor, actor1);
  const count = events.length;
  inbound.at(-1)({ t: 'blocks', pageId: 'page', actor: actor1, seq: 20, ops: [{ k: 'put', id: 'b', parentId: null, block: block('from tab1'), v: 1000 }] });
  assert.equal(state.pages.space[0].content[0].content, 'from tab1');
  await tick(); assert.equal(events.length, count, 'remote apply does not echo');
  stop2();
});

test('the shared broadcast guard restores nested and throwing writes', () => {
  assert.equal(broadcastsSuppressed(), false);
  assert.throws(() => withoutBroadcast(() => withoutBroadcast(() => { assert.equal(broadcastsSuppressed(), true); throw new Error('write'); })), /write/);
  assert.equal(broadcastsSuppressed(), false);
});

test('applyServerPages suppresses its store notification but flushes local drafts first', () => {
  const seen: boolean[] = [];
  const { applyServerPages } = isolatedModule('src/store/sync/applyServerPages.ts', {
    flushAllBlockDrafts: () => seen.push(broadcastsSuppressed()),
    loadLedger: () => ({}), recoveringIds: () => new Set(), getCurrentPageAccessContext: () => null,
    isPageClean: () => true, PAGE_OUTBOX_KEY: 'pages', OUTBOX_RECOVERING_KEY: 'recovery',
    mergeServerPages: (_local: any, rows: any) => ({ pages: rows, serverWon: rows }),
    pageStamp: () => 'stamp', savePagesCache: () => {}, saveOutboxLedger: () => {},
    derivePageState: (pages: any) => ({ pages }), withoutBroadcast,
  });
  const taken = applyServerPages((update: any) => { seen.push(broadcastsSuppressed()); update({ pages: {} }); }, 'space', [{ _id: 'page' }], false);
  assert.equal(taken, 1);
  assert.deepEqual(seen, [false, true]);
  assert.equal(broadcastsSuppressed(), false);
});
