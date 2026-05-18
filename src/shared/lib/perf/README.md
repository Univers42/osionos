# osionos perf harness

The perf helpers are enabled in Vite dev builds. In a non-dev build, enable them before the app loads:

```js
localStorage.setItem('osio:perf', '1');
location.reload();
```

## Console globals

```js
__perfSeed(1000)
await __perfType(200)
await __perfEditorType(200)
await __perfRun()
```

`__perfSeed(blockCount)` creates a synthetic page, opens it, generates deterministic paragraph, heading, and bulleted-list blocks, then writes the blocks through `usePageStore.getState().updatePageContent(...)`. `__perfSeedPage` is kept as an alias.

`__perfType(keystrokes, { blockId, intervalMs })` appends characters through real `usePageStore.getState().updateBlock(...)` dispatches. It records input-to-paint latency percentiles, Event Timing API samples when the browser provides them, `performance.eventCounts` deltas, and sidebar renders per keystroke.

`__perfEditorType(keystrokes, { blockId, intervalMs })` types through the mounted editor element. It records the same latency fields plus `pageStoreActionCalls`, `pageStoreActionCallsPerKeystroke`, and `maxPageStoreActionsPer250Ms` so draft-store coalescing can be verified.

`__perfRun()` runs block counts `100, 500, 1000, 2000, 4000`, performs a 200-keystroke burst, waits 5 minutes before reading heap size, logs one CSV row per scenario, and returns `{ rows, csv }`. The runner restores the previous page-store view and page cache when it finishes.

For a quick smoke run that does not wait for the memory window:

```js
await __perfRun({ scenarios: [100], keystrokes: 5, memoryDelayMs: 0 })
```

## Metrics

`firstPaintMs` is measured from the synthetic `openPage` path to the first painted frame after blocks render.

`keystrokeP50Ms`, `keystrokeP95Ms`, and `keystrokeP99Ms` are measured from each simulated store-dispatched keystroke to the next painted frame.

`updatePageContentMs` and `savePagesCacheMs` warnings come from `timed(...)` wrappers on the hot paths.

`reactCommitCount`, `reactCommitsPerKeystroke`, `reactCommitTotalMs`, and `reactCommitMaxMs` are captured with the React Profiler API around the app root.

`memoryUsedJSHeapSize` and `memoryGrowthBytes` use `performance.memory.usedJSHeapSize` when the browser exposes it. Growth is sampled after seeding/opening and again after the configured memory window.

`keystrokeSyncWorkMs` is the maximum measured synchronous cache/signature-era hot-path work during the typing phase. It currently tracks `savePagesCache` because page version signatures were replaced by revision counters.

Any `timed(...)` or `measure(...)` span over 4ms emits a `[perf]` warning. Component render-count probes log on unmount for `Sidebar`, `SidebarPageTree`, `MainContent`, `OsionosPage`, and `PageBody`.