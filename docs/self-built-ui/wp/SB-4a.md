# SB-4a — The `collection` block: list sources, `$row`, virtual rows, row actions, inline edit (self-built UI, phase S4)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Sources" and "Bind.", §6 "item list, data table, empty state", §11 rows 3–4 and point 5). Settings show many lists: sessions, passkeys, tokens, members, invites, blocked users. Today each is a hand-built list or a `DataTable`. This package adds the one block that repeats a block template per row of a list source, the list-source interface itself, and the `$row` scope that the template's bound blocks and row-action buttons read. SB-4b then adds a source for every settings list.

Base: the integration tip with SB-2c and SB-3b merged (so SB-1b, SB-2a, SB-3a and SB-6a are in too).

## What exists (read these first)

- **Record sources:** `RecordSource`, `FieldSpec`, `SourceStatus`, `createStoreRecordSource` (one store subscription, per-field listeners) and `useBoundField` in `src/entities/block/model/bindingSources.ts`; the registry `src/features/bindings/model/sourceRegistry.ts`. SB-2a reserved `"$row"` for this package.
- **Field and button blocks:** `FieldBlock` (SB-2c) writes through `useBoundField(...).set`; the registered button (SB-3b) runs `runButtonBlock(block, hostPageId, { mode, onSecret })`; program formulas see `scope()` = page props + program vars (`src/services/button-program/interpreter.ts:153`). `prop("Price ($)")` already works in seeds, so a key may hold `$` and `.`.
- **Virtualization:** `@tanstack/react-virtual` (in `package.json`); `measureScrollMargin` and the height estimates in `src/entities/block/model/blockVirtualization.ts`; two identical private copies of `resolveScrollElement` (`PageBlocksRenderer.tsx:39`, `BlockEditorSurface.tsx:349`). The existing `// eslint-disable-next-line react-hooks/incompatible-library` line with its reason (`PageBlocksRenderer.tsx:69-72`) is the accepted pattern for `useVirtualizer`.
- **Perf tools:** `tests/e2e/perf/perfHarness.mjs` (input → second frame), the long-task observer in `tests/e2e/perf/boot.spec.mjs:34-43`, and the render counter SB-2c added in `src/shared/lib/perf/`.
- **Today's look** for the table display: `DataTable` in `src/features/settings/ui/settingsKit.tsx:51-74`.
- **Test seam:** SB-3c's e2e registers a test source through the app's registry. Reuse that seam (`rg -n "__osio" src/features/bindings`); add one only if it is absent, and only when `import.meta.env.MODE === "test"`.

**OWNS:**
- `src/entities/block/model/listSources.ts` (new): `ListSource`, `ListSnapshot`, `createStoreListSource`, `useListSnapshot`;
- `src/entities/block/model/rowScope.tsx` (new): `RowScopeProvider`, `useRowScope`;
- `bindingSources.ts`: the `"$row"` branch of `useBoundField` only;
- `sourceRegistry.ts`: `registerListSource`, `getListSource`, `listListSources`;
- `src/entities/block/registered/collection/{CollectionBlock,CollectionTable,CollectionGrid}.tsx` and `collectionLayout.ts` (pure helpers), all new; the registry entry, the `collection` `BlockType`, `collection?: CollectionConfig` in `types.ts`, the category row, the page-file key, the slash entry `/collection`, the allowlists, the height estimate;
- `blockVirtualization.ts`: `resolveScrollElement` moves here and both copies are deleted in favour of the import;
- `src/services/button-program/runProgram.ts`: a `row` option (Rule 6);
- `src/entities/block/registered/button/ButtonBlock.tsx`: pass `useRowScope()?.row` as `row`. Nothing else;
- tests: `tests/canvas/collection.test.ts`, `tests/e2e/functional/collectionBlock.spec.mjs`, `tests/e2e/perf/collectionScroll.spec.mjs` (all new).

**MUST NOT TOUCH:** the settings panels and stores, `FieldBlock.tsx` (it reads `$row` through `useBoundField` unchanged), the action registry and runner semantics, `interpreter.ts`.

**Commit message:** `feat(blocks): collection block repeats a template per row of a list source, virtualised`

## Interfaces

```ts
interface ListSnapshot {
  status: SourceStatus;                       // "ready" | "loading" | "unavailable"
  rows: readonly Readonly<Record<string, unknown>>[];
  hasMore: boolean;
  error: string | null;                       // the last loadMore failure, shown with Retry
}
interface ListSource {
  id: string;                                 // "list:<name>", ^list:[a-z][a-z0-9-]{0,63}$
  label: string;
  rowKey: string;                             // the field that identifies a row
  fields: readonly FieldSpec[];               // the same shape as RecordSource.fields, looked up by `key`
  subscribe(listener: () => void): () => void;
  getSnapshot(): ListSnapshot;                // same object until something changes
  loadMore?(): Promise<void>;                 // keyset paging; absent = everything is loaded
  update?(rowId: string, field: string, value: unknown): Promise<{ ok: true } | { ok: false; error: string }>;
}
function createStoreListSource<S>(input: {
  id: string; label: string; rowKey: string; fields: ListSource["fields"];
  store: { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };
  rows(state: S): readonly Readonly<Record<string, unknown>>[] | null;   // null = unavailable
  isLoading(state: S): boolean;
  hasMore?(state: S): boolean; error?(state: S): string | null;
  loadMore?(): Promise<void>; update?: ListSource["update"];
}): ListSource;
function useListSnapshot(id: string | undefined): ListSnapshot;          // useSyncExternalStore

type CollectionConfig = {
  source: string;                             // a registered list source id
  display: "list" | "table" | "grid";
  columns?: Array<{ field: string; label?: string }>;   // table only, at most 12
  emptyId?: string;                           // the child shown when there are no rows
  dividers?: boolean;                         // list only
  minColumn?: 40 | 48 | 56 | 64 | 80;         // grid only, in --spacing steps (160–320 px)
};
```

The row template is every child except `emptyId`. Labels are at most 80 characters; the sanitizer drops unknown keys, an unregistered-looking `source` (bad pattern), unknown column fields are kept but render empty.

## Rules (each one is tested)

1. **Stable snapshots.** `getSnapshot` returns the same object while nothing changed, and keeps each unchanged row object (the store's own objects, never copies). Test: changing row 3's field gives a new snapshot whose other rows are `===` the old ones.
2. **One template, one scope per row.** Each row renders the template subtree inside `RowScopeProvider({ source, row })`. React keys are `<rowKey value>:<child id>`. A row component is memoised on its row object, so changing one row re-renders that row only. e2e with the render counter: updating row 5 of 1,000 raises row 5's count by exactly one and no other row's.
3. **`$row` bindings.** `useBoundField("$row", field)` inside a row returns `{ value: row[field], status: "ready", spec: <the FieldSpec whose key is field> }`, and a `set` only when the source has `update` and the spec is writable. `set` calls `source.update(row[rowKey], field, value)`; a failure keeps the old value and shows the error under the control (SB-2c's error path). Outside a row → `"unavailable"`. A `field` block in the template edits the row inline with no change to `FieldBlock`.
4. **Displays.**
   - `list`: rows stacked; `dividers` draws `border-top` with `--osio-border-default` between rows, as `SettingRow` does.
   - `table`: a real `<table>` inside an `overflow-x: auto` wrapper, one `<th scope="col">` per column (its `label`, else the field spec's label). A cell shows the row value formatted by the spec's display: switch/checkbox → "Yes"/"No", an option field → the option's label, else `String(value)`. When the template is not empty it renders in a last column whose header is visually hidden text "Actions". The look follows `DataTable` (`settingsKit.tsx:55-66`): the same tokens for border, header background and row hover.
   - `grid`: `repeat(auto-fill, minmax(calc(var(--spacing) * <minColumn>), 1fr))` through a `data-collection-min` attribute and static CSS, default 64.
5. **States.** `loading` with no rows → three skeleton rows at the template's estimated height (no layout shift when rows arrive). `unavailable` → "<source label> isn't available" in `--osio-fg-muted`. No rows → the `emptyId` child, else "Nothing here yet". `error` → a line under the last row with `role="alert"` and a Retry button that calls `loadMore`.
6. **Row actions.** `runButtonBlock` gains `row?: Readonly<Record<string, unknown>>`. When set, the program scope adds `"$row.<field>"` for each row field, so `{ formula: 'prop("$row.id")' }` resolves to the row's id. The registered button passes `useRowScope()?.row`. Test: a row-action button bound to a test action with `args: { id: { formula: 'prop("$row.id")' } }` runs once with row 7's id when row 7's button is clicked. Guards are untouched: a destructive test action still asks to confirm.
7. **Virtual rows.** At 60 rows or more, rows render through `useVirtualizer` on the nearest scroll container (`resolveScrollElement`), with `measureElement` and the template's estimate (the sum of `estimateBlockHeight` over the template children). The table display virtualises its `<tbody>` with a top and a bottom spacer row. The grid display virtualises rows of cells. `loadMore` runs when the last rendered row is within 10 of the end and `hasMore` is true, never twice at once.
8. **Edit mode.** The block shows a header "Collection · <source label> · <n> rows" with a source picker (`listListSources()`, searchable) and a display `MiniTabs`, then the template children through `renderChildren` (editable), then the live rows as View renders them. Inside a row, a heading `anchor` is not rendered, so no id repeats.
9. **Budgets** (`collectionScroll.spec.mjs`, `PLAYWRIGHT_PERF=1`, a 10,000-row test source; list display; template = a frame holding two paragraphs bound to `$row` fields and a row-action button):
   - scrolling one screen 20 times: no long task over 50 ms (the observer from `boot.spec.mjs`);
   - clicking a row action whose test action updates the row synchronously: app cost p95 ≤ 16 ms (p95 minus the harness floor median, design §11);
   - scaling: that p95 at 10,000 rows minus the p95 at 100 rows ≤ 2 ms.
   Paste the three numbers.

## Steps

- [ ] **Step 1: Failing tests.**
  - Canvas (`collection.test.ts`): snapshot stability (Rule 1); the sanitizer; the table cell formatter for each display; the grid column helper; the `$row` scope keys of Rule 6 (a pure `rowScopeEntries(row)`); `resolveScrollElement` from its new home.
  - e2e (`collectionBlock.spec.mjs`, offline): each display renders the test source's rows; the empty slot; the unavailable note; inline edit through a `$row` field (the source's `update` spy is called with the row id); Rule 2's render counts; Rule 6's row action; the table's header names; at 375 px the page body never scrolls horizontally (the table scrolls in its wrapper).
  - Perf: Rule 9.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/collection.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/collectionBlock.spec.mjs`.
- [ ] **Step 3: Implement.** Move `resolveScrollElement` first (a pure move; the existing virtualisation e2e stay green).
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) rows are not memoised (every row re-renders on one row's change);
  - (b) `getSnapshot` copies the rows array on every call;
  - (c) the row scope is dropped, so `prop("$row.id")` is empty;
  - (d) `loadMore` can run twice at once.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; `npm run test:e2e:perf -- tests/e2e/perf/collectionScroll.spec.mjs` with the three numbers; the `fieldBlock`, `buttonBlockLook` and `settingsKit` e2e unchanged; `ANALYZE=1 npm run build` shows the warm chunk did not grow (paste its size before and after). Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the perf numbers, the warm chunk sizes, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
