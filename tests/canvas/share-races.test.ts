import assert from 'node:assert/strict';
import test from 'node:test';
import { isolatedModule } from './fixtures/isolatedModule.ts';

function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

for (const oldOutcome of ['success', 'error']) {
  test(`share refresh ignores stale ${oldOutcome} and cleanup after resource switch`, async () => {
    const states: any[] = [];
    const refs: any[] = [];
    let slot = 0; let refSlot = 0;
    let effect!: () => () => void;
    const a = deferred(); const b = deferred();
    const { useShareModel } = isolatedModule('src/features/share/useShareModel.ts', {
      useState(initial: any) { const i = slot++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
      useRef(initial: any) { const i = refSlot++; return refs[i] ??= { current: initial }; },
      useCallback: (fn: any) => fn,
      useMemo: (fn: any) => fn(),
      useEffect: (fn: any) => { effect = fn; },
      fetchWorkspacePeople: (id: string) => id === 'A' ? a.promise : b.promise,
      fetchPageSharing: async () => ({ visibility: 'private', collaborators: [], version: 1 }),
      fetchRules: async () => ({ rules: [], teamRules: false }),
      entriesFromPageAccess: (sharing: any) => sharing.collaborators,
      entriesFromRules: () => [],
    });
    const render = (id: string) => { slot = 0; refSlot = 0; return useShareModel({ workspaceId: id, resourceId: id }); };
    render('A'); const cleanupA = effect();
    assert.equal(render('B').loading, true, 'resource switch is disabled before its effect runs');
    cleanupA(); const cleanupB = effect();
    if (oldOutcome === 'success') a.resolve([{ id: 'old' }]); else a.reject(new Error('old error'));
    await tick();
    let model = render('B');
    assert.equal(model.loading, true, 'stale finally cannot clear B loading');
    assert.equal(model.error, null);
    assert.deepEqual(model.people, []);
    b.resolve([{ id: 'new' }]); await tick();
    model = render('B');
    assert.equal(model.loading, false);
    assert.deepEqual(model.people, [{ id: 'new' }]);
    cleanupB();
  });
}

test('sharing carries the read revision, updates it after commit, and refuses an unversioned write', async () => {
  const calls: any[] = [];
  const { fetchPageSharing, commitPageSharing } = isolatedModule('src/features/share/shareApi.ts', {
    api: {
      get: async () => ({ visibility: 'private', collaborators: [], contentVersion: 7 }),
      patch: async (_path: string, payload: any) => { calls.push(payload); return { version: 8 }; },
    },
    getActivePageJwt: () => 'synthetic-session',
    usePageStore: { getState: () => ({ patchPage: () => {} }) },
    sharingPatch: (before: any, after: any) => before.collaborators === after.collaborators ? {} : { collaborators: after.collaborators },
    assertSharingApplied: () => {},
  });
  const before = await fetchPageSharing('page');
  assert.equal(before.version, 7);
  const after = await commitPageSharing('page', before, { ...before, collaborators: [{ userId: 'B', role: 'viewer' }] });
  assert.equal(calls[0].baseVersion, 7);
  assert.equal(after.version, 8);
  await assert.rejects(commitPageSharing('page', { ...before, version: undefined }, after), /revision/);
  assert.equal(calls.length, 1);
});
