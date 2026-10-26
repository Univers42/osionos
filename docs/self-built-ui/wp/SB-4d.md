# SB-4d — The `matrix` display and the permission matrix as a source (self-built UI, phase S4) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §6 "permission matrix": "`collection` display `matrix`: rows from one list source, columns from another, a choice per cell"). Today's matrix is `PermissionsPanel` › `MatrixGrid` › `MatrixCell`: roles × resources, one click cycles a cell `— → r → rw → rwd → —`, and the save deletes the cell's policy and creates its replacement. This package adds the `matrix` display to the collection, moves the matrix state out of a component hook into a store both the panel and a source read, and proves the rebuilt matrix against today's from the same stubbed routes.

👹 because a cell click writes an access-control policy, and the style collection lets a page author restyle what a viewer clicks (Rule 6).

Base: the integration tip with SB-4a, SB-2c and SB-1e merged.

## What exists (read these first)

- `src/features/settings/permissions/`: `PermissionsPanel.tsx` (117 lines), `MatrixGrid.tsx` (role ordering, sticky role column, the role sub-line `department · clearance`), `MatrixCell.tsx` (glyph, tone per level, the `M`/`C` marks, `title`, `aria-label`, disabled while saving), `matrixModel.ts` (`cellState`, `deriveResources`, `nextLevel`, `payloadForCell`, `LEVEL_GLYPHS`), `usePolicyMatrix.ts` (component state; `cycleCell` = delete then create then refetch).
- `src/features/share/sharePolicyApi.ts`: `fetchRoles`, `fetchPolicies`, `fetchPeople`, `createPolicy`, `deletePolicy` (`/api/perms/*`).
- **There is no e2e for this panel today** (`rg -l "Access matrix|Click to cycle access" tests` finds none). Step 1 writes the characterisation test first, against today's panel, before anything moves.
- Mechanism: `ListSource`, `createStoreListSource`, the collection block, `RowScopeProvider`, `$row` (SB-4a); `FieldSpec`, `FieldBlock` (SB-2a, SB-2c); `useTrustedPage(hostPageId)` (`src/entities/page/model/pageTrust.ts`, SB-1e): call it, never re-derive the rule.

**OWNS:**
- `src/features/settings/permissions/policyMatrixStore.ts` (new): the zustand store holding today's `usePolicyMatrix` state and calls;
- `usePolicyMatrix.ts` (modified): a selector over the store plus the load effect, returning the same `PolicyMatrix` interface, so `PermissionsPanel.tsx` does not change;
- `MatrixCell.tsx` (modified): renders the new shared `CycleButton`, markup and classes unchanged;
- `src/shared/ui/CycleButton.tsx` (new), exported from `@/shared/ui`;
- `bindingSources.ts` (modified): `MatrixSource`, `registerMatrixSource`, `getMatrixSource`, the `"cycle"` `FieldDisplay`, and the option fields `tone`, `strong`, `inCycle`. Nothing else;
- the collection block (modified): `display: "matrix"`, `rowHeaderId`, `corner` (Interfaces);
- `src/features/bindings/sources/matrix/permissions.ts` (new): `list:perm-roles`, `list:perm-resources`, `matrix:perms` + registration;
- `actionRegistry.ts` (modified): `perms.refresh`;
- tests: `tests/canvas/matrix-source.test.ts`, `tests/e2e/functional/permissionsMatrix.spec.mjs` (today's panel), `tests/e2e/functional/matrixDisplay.spec.mjs` (the rebuild).

**MUST NOT TOUCH:** `PermissionsPanel.tsx`, `MatrixGrid.tsx`, `matrixModel.ts` (call it), `ConditionEditor.tsx`, `FieldMaskEditor.tsx`, `ViewAsTester.tsx`, `sharePolicyApi.ts`, the bridge.

**Commit message:** `feat(bindings): the matrix display, with the permission matrix as a source`

## Interfaces

```ts
// bindingSources.ts
type FieldDisplay = … | "cycle";
interface FieldOption { value: string; label: string; tone?: "subtle" | "muted" | "accent" | "success" | "danger"; strong?: true; inCycle?: false }
interface MatrixCell {
  value: string;                                         // one of `cell.options`
  ariaLabel: string;                                     // built by the source, never by the page
  title?: string;
  marks?: readonly { text: string; tone: "accent" | "muted" }[];
}
interface MatrixSource {
  id: string;                                            // ^matrix:[a-z][a-z0-9-]{0,63}$
  label: string;
  rows: string;                                          // a list source id
  columns: string;                                       // a list source id; each row has `label`
  cell: FieldSpec;                                       // display "cycle", with options
  trustedOnly?: true;                                    // Rule 6
  subscribe(listener: () => void): () => void;
  getCell(rowId: string, columnId: string): MatrixCell;  // same object until that cell changes
  isBusy(): boolean;                                     // every cell disabled while true
  setCell?(rowId: string, columnId: string, value: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

// the collection
type CollectionConfig = … & {
  display: … | "matrix";                                 // `source` is then a matrix source id
  rowHeaderId?: string;                                  // a child rendered in each row's header cell, in that row's scope
  corner?: string;                                       // the top-left header text, at most 80 characters
};

// shared/ui
function CycleButton(props: { label: string; tone: FieldOption["tone"]; strong?: boolean; ariaLabel: string; title?: string; marks?: MatrixCell["marks"]; disabled?: boolean; onCycle(): void }): JSX.Element;
```

## Rules (each one is tested)

1. **One store, one call path.** `policyMatrixStore` holds `loading`, `saving`, `error`, `roles`, `people`, `policies` and `load(workspaceId)`, `setCellLevel(roleId, resource, level)`, `cycleCell(roleId, resource)` (= `setCellLevel` with `nextLevel` of the current level), `saveCellConditions`, `refresh`. Each call does what `usePolicyMatrix` does today, in the same order, with the same error copy. `usePolicyMatrix(workspaceId)` returns the same interface. Spy test: clicking a cell in today's panel and the same cell in the rebuild make the same `deletePolicy` / `createPolicy` / `fetchPolicies` calls with the same arguments. `Caveat:` the store holds one workspace at a time; `load` of another workspace replaces it, as switching workspaces does today.
2. **The sources.**
   - `list:perm-roles`: rowKey `id`; fields `name`, `detail` (`<department> · clearance <clearance or "—">` when `metadata.department` is a string, else empty); ordered as `MatrixGrid` orders them (`agency:` first, then `localeCompare`).
   - `list:perm-resources`: rowKey `id`, `label` = the resource name, ordered by `deriveResources`. Row objects are kept by name, so an unchanged name keeps its object.
   - `matrix:perms`: `cell` = `level` with options none `—` subtle, view `r` muted, edit `rw` accent, full `rwd` success strong, deny `✕` danger strong `inCycle: false`; `ariaLabel` `"<role> on <resource>: <level>. Click to cycle access."` and `title` `"<role> × <resource>: <level>< (masked)> — click to cycle"`, today's strings; marks `M` (accent) when masked, `C` (muted) when conditioned; `isBusy` = `saving`; `setCell` → `setCellLevel`, `{ ok: false, error }` when the store's `error` is set after the call; `trustedOnly: true`.
   - `getCell` reads an index built once per `policies` array (O(policies)), so a render is O(rows × columns), not O(rows × columns × policies). A recomputed cell equal to the previous one keeps the previous object.
   - Property test: 500 seeded random policy sets (deny and allow, priorities, masks, conditions, `*` resources); for every role × resource, `getCell` agrees with `cellState` on level, masked and conditioned.
3. **The `cycle` control.** A click sets the value to the next option with `inCycle` not `false`, wrapping, and a value outside the cycle goes to the first option. Test: for each of the five levels it gives the same next level as `nextLevel`. `CycleButton` is today's `MatrixCell` button, moved: `MatrixCell` renders it, and its markup and classes do not change (an e2e reads the class list and the computed style of one cell before and after). In preview mode (SB-6a) and while `isBusy()`, every cell is `disabled`.
4. **The display.** A real `<table>` in an `overflow-x: auto` wrapper with `MatrixGrid`'s look: `rounded-lg` border `--osio-db-line`, header row on `--osio-bg-subtle`, a sticky first column, `<th scope="col">` per column (the column's `label`, `font-mono`, centred), `<th scope="row">` per row holding `rowHeaderId`'s child in that row's scope (else the row's first field), rows divided by `--osio-db-line-soft`. A cell is `<td>` holding the kernel `CycleButton` from `getCell`; a page cannot replace the cell control. States follow SB-4a Rule 5 (the rows source's status; the matrix source's error on an alert line). One cell change re-renders that cell only (the render counter: cycling one cell of 20 × 15 raises one cell's count by one and no other's).
5. **Parity e2e.** `permissionsMatrix.spec.mjs` first pins today's panel against stubbed `/api/perms/roles`, `/api/perms/policies`, `/api/perms/people` (3 roles including one `agency:` role with department metadata, 4 resources including `*`, a deny, a masked and a conditioned policy): row order, header texts, every cell's glyph, `aria-label` and marks, and the request sequence of one click. `matrixDisplay.spec.mjs` builds a test page with a `collection` over `matrix:perms` (`corner: "Role"`, a row header of two paragraphs bound to `$row` › `name` and `detail`, the second with `visibleWhen: 'prop("$row.detail") != ""'`) and asserts the same texts, names, marks, order and requests, plus the computed style of the header row, the role cell and one cell of each level against today's, light and dark.
6. **Trusted pages only.** A collection over a source with `trustedOnly` renders the unavailable state ("Permission matrix isn't available") unless `useTrustedPage(hostPageId)` is true: a system page (SB-1e) or a page the viewer owns. A page author can restyle the table, but cannot show another viewer a live permission control. Tests: the same collection on a page the viewer owns renders cells; on a page another user owns it renders the unavailable state and calls no `/api/perms/*` route; a stray `trusted: true` in block data changes nothing.
7. **`perms.refresh`.** `confirm: "none"`, no params, run = the store's `refresh()`; `failed` with the store's error when set after the call.

## Devil conditions (D-SB-4d-spec, 2026-10-26 02:00, kimi-k3: PROCEED-WITH-CONDITIONS)

Acceptance criteria. Each has a test that fails when it is broken; name it in the report.

1. **The page path loads.** `matrix:perms` reads the workspace from `useUserStore`'s `activeWorkspace` (as `SettingsView.tsx:84,94` does) and calls `load` on its first subscriber, the pattern of `bindingSources.ts:125-129`. e2e: a trusted page opened fresh (Settings never visited) calls `/api/perms/roles`, `/policies` and `/people` exactly once with the active workspace id and renders cells; an untrusted page calls none of them.
2. **The latest load wins.** `load` carries a monotonic id and drops any resolution that is not the latest requested workspace's. Canvas test: a slow `load(A)` and a fast `load(B)` end in B's state, and `cellFor` never returns A's rows.
3. **A failed save shows the truth.** When `deletePolicy` succeeds and `createPolicy` fails, the store refetches the policies before setting the error, so the cell shows the post-delete state. This changes today's panel too (it shares the store); the parity e2e pins the new behaviour for both: create → 500 shows the glyph change, the error and one extra `fetchPolicies` call. The happy-path request sequence is unchanged.
4. **Removing a deny asks first.** In the rebuild, a click on a `deny` cell opens a confirm ("Remove the explicit deny for <role> on <resource>? This widens access.", label "Remove deny"), and only a confirm runs `setCellLevel(…, "none")`. Today's panel keeps its one-click behaviour (MUST NOT TOUCH); the difference is recorded under Out of scope. Tests: cancel sends no request; confirm sends today's delete.
5. **Restyling cannot change the control.** Presets and colours on the collection and its enclosing frames never change a cell's glyph, tone, `title` or `aria-label` (e2e: a heavily restyled page and a plain one give the same values). Rule 6's line is ownership: a page the viewer owns is trusted even when its content was copied from someone else (`duplicatePage`, `usePageActions.ts:229`). That is recorded under Out of scope as a call for the owner to review; the bridge's admin check (`scripts/bridge-perms.mjs:220-224`) stays the security boundary.
6. **Deny beats priority in the property test.** The seeded generator always includes a class of (role, resource) pairs with a lower-priority deny and a higher-priority allow, whose level must be `deny`. Mutant (f): the index lets the higher-priority allow win.
7. **Parity names every detail.** The computed-style capture covers the `<table>` (`w-full min-w-[640px] text-sm`, `MatrixGrid.tsx:35`), the header text classes, the resource header's `text-2xs`, and the row `:hover` background (`MatrixGrid.tsx:46`). Deviations recorded under Out of scope: the role cell becomes `<th scope="row">` (today `<td>`, `MatrixGrid.tsx:47`); the error shows on SB-4a's alert line (today a red box, `PermissionsPanel.tsx:53`).
8. **Busy does not re-render cells.** Cells read `isBusy()` through their own subscription, not a prop, so a click changes no other cell's object or props. The render counter sits on the memoised cell; the Rule 4 test runs a full settled click (busy on, save, refetch, busy off) and asserts net counts: the clicked cell's count rises, no other cell's does.

## Out of scope (recorded, not fixed here)

- `cycleCell` deletes the policy before creating its replacement, and `payloadForCell` writes priority 50 even when the old policy had another (`matrixModel.ts:86`). Condition 3 makes the failure visible; making the save atomic is a bridge change, listed as a finding for the owner.
- Today's panel removes a deny in one click; the rebuild asks first (condition 4).
- A page the viewer owns is trusted, including one duplicated from a stranger's page (condition 5).
- The role cell is a `<th scope="row">` and the error is SB-4a's alert line (condition 7).
- The conditions and field-mask editors and the "View as" tester stay React; SB-5-permissions decides their blocks.
- Today's loading sentence "Loading roles and policies…" becomes SB-4a's skeleton rows in the rebuild (a deviation; the panel itself is unchanged).

## Steps

- [ ] **Step 1: The characterisation e2e.** Write `permissionsMatrix.spec.mjs` against today's panel and see it pass before any other change. Then the failing tests: canvas (`matrix-source.test.ts`) for Rules 1–3, 6 and 7, and `matrixDisplay.spec.mjs` for Rules 4–6.
- [ ] **Step 2: Run them and see the new ones fail.** `npm run test:canvas -- tests/canvas/matrix-source.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/permissionsMatrix.spec.mjs tests/e2e/functional/matrixDisplay.spec.mjs`.
- [ ] **Step 3: Implement.** Move the state into the store first and re-run `permissionsMatrix.spec.mjs` before going on.
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) `getCell` returns a new object on every call;
  - (b) the cycle control cycles to `deny`;
  - (c) the trust check is skipped for `trustedOnly` sources;
  - (d) `setCell` returns `ok` when the store's `error` is set;
  - (e) the cell index ignores priority (a lower-priority allow wins over a higher one);
  - (f) the index lets a higher-priority allow beat a deny.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; both e2e green; `shareRules.spec.mjs` and `shareTeams.spec.mjs` unchanged and green. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the two out-of-scope findings with their e2e lines, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
