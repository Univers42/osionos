# SB-4e — Components: definition, instance, slots, props, variants, and the shipped settings components (self-built UI, phase S4)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §9 and §11 point 1). Presets (SB-4f) reuse one block's look. Components reuse structure: `SettingRow` appears 92 times in the settings panels today, and 23 settings documents holding 92 copied subtrees would move the duplication into JSON. A component is a named block subtree with slots, props and variants; an `instance` block points at it, and editing the component changes every instance.

Base: the integration tip with SB-4f and SB-3c merged (so SB-1d, SB-2c and the heading `anchor` are in too).

## What exists (read these first)

- **Documents:** `SystemDoc`, `parseSystemDoc`, `normalizeSystemBlocks`, `serializeSystemDoc`, `loadSystemDoc` and the fixpoint test (`src/features/system-pages/model/`); kind `"components"` is already in `SystemDocKind`. SB-4f made `presets/` an eager glob; follow the same pattern for `components/`.
- **Presets:** `src/system-docs/presets/settings.json`, `blockPresets.ts`, and the parity test `tests/e2e/functional/presetParity.spec.mjs` with its fixture.
- **Blocks the shipped components use:** `frame` (SB-1b), `paragraph`/`heading_2` with `style` and `anchor` (SB-4f, SB-3c), `field` (SB-2c), `secret` (SB-3c), `button` (SB-3b).
- **The registry pattern:** follow `frame` for the new type (category row, page-file key, slash id `block:instance`, allowlists, height estimate).
- **Sources of the look:** `settingsKit.tsx` (`Section`, `SettingRow`, `FeatureCard`, `EmptyState` :159-172), `DangerZone.tsx`.

**OWNS:**
- `src/entities/block/model/components.ts` (new): the types, `getShippedComponent`, `listShippedComponents`, `expandInstance`;
- `src/entities/block/registered/instance/InstanceBlock.tsx` (new) + its registry entry, the `instance` `BlockType`, `instance?: InstanceConfig` and `slot?: string` in `types.ts`, their page-file keys, the category row, the slash entry, the allowlists, the height estimate;
- `systemDoc.ts`: the `component` envelope field and the checks of Rule 2; the loader glob excludes `components/`;
- `src/system-docs/components/*.json` (new, written with `serializeSystemDoc`): the eight shipped components;
- `src/system-docs/presets/settings.json`: the presets the eight need beyond SB-4f's, added through SB-4f's parity test;
- `schema.generated.json`: regenerated;
- tests: `tests/canvas/components.test.ts`, `tests/e2e/functional/componentInstances.spec.mjs` (new); extend `presetParity.spec.mjs` and its fixture for the new presets.

**MUST NOT TOUCH:** the settings panels and `settingsKit.tsx` (the reference), the bridge, the block types the components use beyond reading them.

**Commit message:** `feat(blocks): components with slots, props and variants, and the shipped settings components`

## Interfaces

```ts
// A components document: SystemDoc with kind "components", exactly one root block,
// and one extra envelope field. `version` is the component's version.
interface ComponentDef {
  props: Readonly<Record<string, PropDef>>;        // name ^[a-z][a-zA-Z0-9]{0,31}$, at most 16
  variants?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;  // variant → prop values, at most 8
}
interface PropDef {
  label: string;                                    // at most 60 characters
  target: { block: string; key: PropTargetKey };    // a block id inside the component
  default?: unknown;
}
type PropTargetKey = "content" | "anchor" | "recordRef" | "fieldBind" | "buttonLabel" | "preset" | `style.${string}`;
// A block inside the component with `slot: "<name>"` is a slot: an instance's children
// whose own `slot` names it are placed there, in order.

interface InstanceConfig { component: string; props?: Record<string, unknown>; variant?: string }
function expandInstance(instance: Block, def: SystemDoc /* kind components */): Block[];
```

## Rules (each one is tested)

1. **Expansion.** `expandInstance` deep-copies the component's root subtree and:
   - rewrites every id to `<instance id>/<original id>`, so ids are stable across renders and unique per instance;
   - applies the variant's prop values, then the instance's `props` (the instance wins), each through its `target`; a value is sanitised by the target key's own sanitiser (`content` as rich text, `anchor` by SB-3c's slug rule, `style.<key>` by `sanitizeBlockStyle`), and an invalid value falls back to the prop's `default`;
   - places each instance child into the slot whose name equals the child's `slot` (no `slot` → the first slot, in document order), keeping the instance child's own id and object, so slot contents stay editable blocks;
   - ignores props the component does not declare (they stay in the data, for a newer component version).
2. **Strict checks** on a components document: exactly one root block; every `target.block` names a block inside it; `target.key` is a `PropTargetKey` and a `style.<key>` names a `PROP_SCALE` key; slot names are unique; `variants` only set declared props. On an instance anywhere: `instance.component` names a shipped component, else `"<blockId>.instance"` (lenient lists it in `unknown`).
3. **Cycles and depth.** An instance inside a component may reference another component. Expansion stops at depth 4 and on a cycle (A → B → A), rendering the note "Component cycle · <id>" (`role="note"`, muted) instead of recursing. Test both.
4. **Memoised.** `expandInstance` caches by instance block identity and component version, so an unchanged instance returns the same array. A test expands 100 instances of `setting-row`, then re-expands them unchanged: every result is `===` the first, and changing one instance's props changes only that one.
5. **Render.** View renders the expansion through the normal renderers. Edit renders the expansion with slot children through `renderChildren` (editable) and the copied blocks read-only, plus a caption "Component · <title>" and a props form: one `Input` per text prop, a `Dropdown` per `style.*` prop with its scale values, and a variant `Dropdown` when variants exist. A props form change writes `instance.props` through `onUpdate`. An unknown component renders "Component not found · <id>" in Edit and nothing in View.
6. **The shipped components** (one file each in `src/system-docs/components/`):

   | id | structure | props | slots |
   |---|---|---|---|
   | `section` | frame `section` > heading_2 `section-title` + slot frame | title, anchor | body |
   | `setting-row` | frame `setting-row` > frame `setting-text` (title, description paragraphs) + frame `setting-actions` | title, description; variants `stacked`, `danger` | action |
   | `toggle-row` | `setting-row` with a `field` in the actions frame | title, description, recordRef, fieldBind | — |
   | `field-row` | `setting-row-stacked` with a `field` under the text | title, description, recordRef, fieldBind | — |
   | `danger-zone` | `section` titled "Danger zone", anchor `danger`, holding a `danger-zone` frame | anchor | body |
   | `empty-state` | the `EmptyState` look | title, hint | action |
   | `feature-card` | `card` > `feature-card` row: icon tile, title, description | title, description | icon, action |
   | `secret-box` | `card` holding a `secret` block and its caption | caption, recordRef, fieldBind | — |

   The variant `stacked` sets `preset` of the row to `setting-row-stacked`; `danger` sets the title's `preset` to `setting-title-danger`. Empty state needs new presets (`empty-state` and its text), which go through SB-4f's parity test like the others.
7. **Same render as the hand-built tree.** For `setting-row`, `section` and `danger-zone`: the expansion with ids stripped deep-equals a hand-built tree of the same presets. The e2e places an instance of each of the eight on a page and compares `setting-row`, `danger-zone` and `empty-state` with their source elements using SB-4f's property list and spacing check, light and dark.

## Steps

- [ ] **Step 1: Failing tests.** Canvas: Rules 1–4 (id rewrite, variant then props order, sanitised and default values, slot placement, undeclared props ignored, the strict errors, cycle and depth notes, cache identity). e2e: Rule 5's props form edits a title and the change shows in View; Rule 7's parity.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/components.test.ts`; `PW_BROWSER_SOURCE=system bash scripts/docker-run.sh test-e2e tests/e2e/functional/componentInstances.spec.mjs`.
- [ ] **Step 3: Implement.** Write each component document through `serializeSystemDoc`, then `npm run system-docs:schema`.
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) instance props apply before the variant (the variant wins);
  - (b) ids are not rewritten (two instances share ids);
  - (c) the cycle check is removed;
  - (d) the cache ignores the component version.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0 (schema check and fixpoint pass); the `presetParity`, `frameBlock` and `settingsKit` e2e green. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the presets added, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
