# SB-2a — Binding sources: registry, per-field subscriptions, viewer scope (self-built UI, phase S2)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 and §11 item 2). A settings page made of blocks needs blocks that read and write real settings: a switch bound to "reduce motion" must call the same store action the Preferences panel calls today. This package adds the mechanism. Later packages plug the real settings into it (SB-2b) and build on it (`field` in SB-2c, `collection` in SB-4a).

Base: the integration tip. Nothing here needs SB-1b or SB-1d, so it runs in parallel with them (re-planned 2026-10-25 20:55 to widen the critical path).

## One binding vocabulary: extend `recordRef` / `fieldBind`, don't add `bind`

Blocks already bind to a record. `recordRef: "$record"` (or the legacy `"$viewedUser"`) plus `fieldBind: "<key>"` renders a field of the record in context (`src/entities/block/model/binding.ts`, `BoundFieldReadOnly.tsx`, provided by `widgets/profile-page/model/binding.tsx`). The design's `bind: { source, field }` **is** this pair. `recordRef` names the source and `fieldBind` the field:
- `"$record"` / `"$viewedUser"`: the record in context, unchanged, static, read-only;
- `"settings:<name>"`: a registered record source (this package);
- `"$row"`: the current collection item (reserved here, implemented in SB-4a).

No new block field is added, and existing README bindings keep working byte for byte. Update design §5's "Bind." line to say so, in the same commit.

**OWNS:**
- `src/entities/block/model/bindingSources.ts` (new): the interfaces, `createStoreRecordSource`, `BindingSourcesContext`, `useBoundField`;
- `src/features/bindings/model/sourceRegistry.ts` (new): `registerRecordSource` / `getRecordSource` / `listRecordSources`, a static registry filled at module load;
- `src/features/bindings/ui/BindingSourcesProvider.tsx` (new): provides the registry to the tree, mounted once in `src/App.tsx`, next to the other app-wide providers;
- `src/entities/block/ui/BoundFieldReadOnly.tsx` (modified): read through `useBoundField`, so a `settings:` ref renders its value;
- `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` (§5 "Bind." line only);
- tests: `tests/canvas/binding-sources.test.ts`.

**MUST NOT TOUCH:** the settings stores (SB-2b wraps them), `binding.ts`'s `README_FIELDS` and `resolveBoundField` (reuse them for `$record`), the bridge.

**Commit message:** `feat(bindings): record sources with per-field subscriptions behind recordRef/fieldBind`

## Interfaces

```ts
type FieldDisplay = "text" | "email" | "url" | "number" | "password" | "multiline" | "switch" | "checkbox"
  | "dropdown" | "segmented" | "radio" | "checkbox-list" | "search" | "image" | "file";

interface FieldSpec {
  key: string; display: FieldDisplay; label: string;
  options?: readonly { value: string; label: string }[];
  readOnly?: boolean;
  validate?(value: unknown): string | null;   // message shown under the field, or null when valid
}

type SourceStatus = "ready" | "loading" | "unavailable";

interface RecordSource {
  id: string;                                  // "settings:preferences"
  label: string;
  fields: readonly FieldSpec[];
  status(): SourceStatus;
  get(field: string): unknown;                 // the viewer's current value
  subscribe(field: string, onChange: () => void): () => void;   // fires only when THAT field changes
  set?(field: string, value: unknown): void;   // absent = read-only source
  load?(): void;                               // idempotent; first subscriber calls it
}

function createStoreRecordSource<S>(input: {
  id: string; label: string; fields: readonly FieldSpec[];
  store: { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };
  read(state: S): Record<string, unknown> | null;   // null while not loaded
  isLoading(state: S): boolean;
  write?(patch: Record<string, unknown>): void;      // the store action the panel calls today
  load?(): void;
}): RecordSource;

interface BoundField { value: unknown; status: SourceStatus; spec: FieldSpec | null; set: ((value: unknown) => void) | null; error: string | null }
function useBoundField(recordRef: string | undefined, field: string | undefined): BoundField;
```

## Rules

1. **Per-field subscriptions.** `createStoreRecordSource` holds one store subscription for the whole source, created when the first field listener arrives and dropped with the last one. Its listeners live in a `Map<field, Set<listener>>`. On a store change it compares, with `Object.is`, only the fields that have listeners, and calls only those listeners. Cost per store change: O(subscribed fields).
2. **`useBoundField`** uses `useSyncExternalStore((cb) => source.subscribe(field, cb), () => source.get(field))`. A change to another field of the same source does not re-render it.
3. **Validation before write.** `set(value)` runs `spec.validate` first. An error goes into `BoundField.error` (local state of the hook) and nothing is written. A `readOnly` field, or a source without `set`, has `set: null`.
4. **Viewer scope.** A source reads the stores of the signed-in viewer, and nothing else. There is no "author" value and nothing to resolve for another user. With no signed-in user (offline public page), every `settings:` source reports `"unavailable"`, and `BoundFieldReadOnly` renders its existing placeholder.
5. **Unknown refs fail closed for writes, open for display.** An unregistered `settings:x` → `status: "unavailable"`, `set: null`, and the block shows the field name as a placeholder (today's behaviour outside a binding context). It never throws.
6. **`$record` / `$viewedUser`** resolve through the existing `useBoundRecord()` + `resolveBoundField`, `status: "ready"`, read-only. No behaviour change: the profile README e2e must stay green.
7. **Dependency direction.** `entities/` defines the interfaces and the hook. `features/bindings` holds the registry, and `App.tsx` provides it through the context. Entities never import features.

## Steps

- [ ] **Step 1: Failing tests** (`tests/canvas/binding-sources.test.ts`), with a minimal fake store (`getState` / `subscribe` / a `setState` that calls listeners with `(next, prev)`):
  - two listeners on `a` and one on `b`: changing only `b` calls `b`'s listener once and `a`'s zero times;
  - changing an unsubscribed field `c` calls no listener;
  - the store subscription is created on the first listener and released after the last unsubscribe (count the fake's active listeners: 1 then 0);
  - `get("a")` returns the stored value; with `read → null` the status is `"loading"` when `isLoading`, else `"unavailable"`;
  - `set` on a field whose `validate` returns `"Too long"` does not call `write`; a valid value calls `write({ a: value })` exactly once;
  - a `readOnly` field: `set` is refused, and `write` is never called.
- [ ] **Step 2: Run and see them fail.** `npm run test:canvas -- tests/canvas/binding-sources.test.ts`.
- [ ] **Step 3: Implement** `bindingSources.ts`, the registry, the provider, and the `BoundFieldReadOnly` read path.
- [ ] **Step 4: Mutant** (scratch copy): make the store listener notify every field's listeners. The first test must fail; paste its name.
- [ ] **Step 5: Gates.** The test passes; `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the profile README e2e (`tests/e2e/functional/profilePagePublic.spec.mjs` and any spec matching `rg -l "fieldBind\|recordRef" tests/e2e`) passes unchanged. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

List the files changed, paste the gate lines and the mutant result, and give the commit SHA. A gate you could not run is SKIPPED with the reason.
