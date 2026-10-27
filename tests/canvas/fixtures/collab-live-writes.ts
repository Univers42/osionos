import assert from 'node:assert/strict';
import test from 'node:test';
import { isolatedModule } from './isolatedModule.ts';
import { broadcastsSuppressed, withoutBroadcast } from '../../../src/store/sync/broadcastGuard.ts';

const block = (content: string) => ({ id: 'b', type: 'paragraph', content });
const tick = () => new Promise((resolve) => setTimeout(resolve, 35));

function harness(fastSend = false) {
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
    useCollabStore: Object.assign(() => channel, { getState: () => ({ broadcast: (e: any) => events.push(e), nextSeq: () => ++seq, onEvent: channel.onEvent }) }),
    usePageStore: { subscribe(fn: any) { subs.add(fn); return () => subs.delete(fn); }, getState: () => state },
    readLocalCaretAndSelection: () => ({}),
  };
  const dependencies = {
    react: { useEffect: bindings.useEffect, useCallback: (fn: any) => fn, useSyncExternalStore: () => '' },
    'src/shared/config/featureFlags.ts': { isCollabFastSendEnabled: () => fastSend },
    'src/shared/api/client.ts': { getActivePageJwt: () => null },
    'src/store/usePageStore.ts': { usePageStore: bindings.usePageStore },
    'src/store/sync/hydratePages.ts': { hydrateWorkspace: async () => {} },
    'src/features/collab/model/localCaret.ts': { readLocalCaretAndSelection: bindings.readLocalCaretAndSelection },
    'src/features/collab/store/useCollabStore.ts': { useCollabStore: bindings.useCollabStore },
  };
  return { dependencies, events, inbound, starts, write, state: () => state };
}

test('server loads never broadcast blocks, local edits do, and persona tabs do not drop each other', async () => {
  const { dependencies, events, inbound, starts, write, state: readState } = harness();
  const tab1 = await isolatedModule('src/features/collab/ui/useLiveBlockSync.ts', dependencies);
  tab1.useLiveBlockSync('space', 'persona', 'page'); const stop1 = starts.pop()();
  write([{ _id: 'page', content: [block('loaded')] }]); await tick();
  assert.deepEqual(events, [], 'undefined-to-loaded is not a local edit');
  withoutBroadcast(() => write([{ _id: 'page', content: [block('server changed')] }])); await tick();
  assert.deepEqual(events, [], 'server refresh suppresses every outbound path');
  write([{ _id: 'page', content: [block('local')] }]); await tick();
  assert.equal(events[0].t, 'blocks');
  assert.match(events[0].actor, /^persona:/);
  const actor1 = events[0].actor;
  stop1();
  const tab2 = await isolatedModule('src/features/collab/ui/useLiveBlockSync.ts', dependencies);
  tab2.useLiveBlockSync('space', 'persona', 'page'); const stop2 = starts.pop()();
  write([{ _id: 'page', content: [block('tab2')] }]); await tick();
  assert.notEqual(events.at(-1).actor, actor1);
  const count = events.length;
  inbound.at(-1)({ t: 'blocks', pageId: 'page', actor: actor1, seq: 20, ops: [{ k: 'put', id: 'b', parentId: null, block: block('from tab1'), v: 1000 }] });
  assert.equal(readState().pages.space[0].content[0].content, 'from tab1');
  await tick(); assert.equal(events.length, count, 'remote apply does not echo');
  stop2();
});

test('the shared broadcast guard restores nested and throwing writes', () => {
  assert.equal(broadcastsSuppressed(), false);
  assert.throws(() => withoutBroadcast(() => withoutBroadcast(() => { assert.equal(broadcastsSuppressed(), true); throw new Error('write'); })), /write/);
  assert.equal(broadcastsSuppressed(), false);
});

test('applyServerPages suppresses its store notification but flushes local drafts first', async () => {
  const seen: boolean[] = [];
  const { applyServerPages } = await isolatedModule('src/store/sync/applyServerPages.ts', {
    'packages/outbox-ledger/src/index.ts': { loadLedger: () => ({}) },
    'src/features/block-editor/model/blockDraftStore.ts': { flushAllBlockDrafts: () => seen.push(broadcastsSuppressed()) },
    'src/shared/lib/auth/pageAccess.ts': { getCurrentPageAccessContext: () => null, canEditPage: () => true },
    'src/store/pageStore.helpers.ts': { derivePageState: (pages: any) => ({ pages }), savePagesCache: () => {} },
    'src/store/sync/mergeServerPages.ts': {
      isPageClean: () => true, mergeServerPages: (_local: any, rows: any) => ({ pages: rows, serverWon: rows }),
    },
    'src/store/sync/outboxRecovery.ts': { OUTBOX_RECOVERING_KEY: 'recovery', recoveringIds: () => new Set() },
    'src/store/sync/pageStamp.ts': { PAGE_OUTBOX_KEY: 'pages', pageStamp: () => 'stamp', saveOutboxLedger: () => {} },
  });
  const taken = applyServerPages((update: any) => { seen.push(broadcastsSuppressed()); update({ pages: {} }); }, 'space', [{ _id: 'page' }], false);
  assert.equal(taken, 1);
  assert.deepEqual(seen, [false, true]);
  assert.equal(broadcastsSuppressed(), false);
});

test('collabFastSend: flag off taps nothing; flag on sends a put in the same task and a corrective one on undo', async () => {
  const drafts = await import('../../../src/features/block-editor/model/blockDraftStore.ts');
  for (const flag of [false, true]) {
    const { dependencies, events, starts, write } = harness(flag);
    const mod = await isolatedModule('src/features/collab/ui/useLiveBlockSync.ts', dependencies);
    mod.useLiveBlockSync('space', 'persona', 'page'); const stop = starts.pop()();
    write([{ _id: 'page', content: [block('hello')] }]);
    drafts.setBlockDraft('page:page', 'b', 'hello', 'hello!');
    const sameTask = events.length;
    drafts.setBlockDraft('page:page', 'b', 'hello', 'hello');
    drafts.clearBlockDraft('page:page', 'b');
    assert.equal(sameTask, flag ? 1 : 0, flag ? 'fast put left synchronously' : 'flag off: no tap, nothing leaves before the 16 ms diff');
    assert.equal(events.length, flag ? 2 : 0);
    if (flag) {
      assert.equal(events[0].ops[0].block.content, 'hello!');
      assert.equal(events[1].ops[0].block.content, 'hello', 'undo corrected the peer');
    }
    stop();
  }
});
