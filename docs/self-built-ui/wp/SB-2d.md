# SB-2d — Profile draft source with a `profile.save` action, and the page-settings source (self-built UI, phase S2)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5). SB-2b covered the sections whose controls write on change. Two sections work differently:
- **Public profile** edits a draft, validates it, and saves only the changed fields with `If-Match` behind a Save button. The outcome can be a conflict (412), an invalid field, or a failure.
- **Page settings** write through `usePageActions`, a React hook, so nothing outside React can call them.

This package gives both a record source. The profile source is a draft with a save action. The page-settings source writes through a plain function that the hook now calls too.

Base: the integration tip with SB-2b and SB-3a merged.

## What exists (read these first)

- **Profile.**
  - `src/features/settings/profile/PublicProfileSection.tsx:90-125`: `edits` draft over `formFromProfile(profile)`, `formErrors`, `diffProfile`, `toPatch`, `save(patch)`, and the outcomes `ok` / `conflict` / `invalid(field)` / `unavailable` / `failed` (`src/shared/api/accountProfileApi.ts:63-68`).
  - Validators and helpers: `src/features/settings/profile/profileFields.ts` (`ProfileForm`, `validate*`, `MAX_LINKS`, `formFromProfile`:106, `diffProfile`:121, `toPatch`:130). `formErrors` is still local to the section (:39).
  - Store: `useAccountProfileStore` (`status`, `profile`, `hydrate()`, `save(patch)`).
- **Page settings.**
  - `src/features/settings/page-settings/PageSettingsPanel.tsx:24-52`: font, small text, full width, lock, all on `usePageStore.getState().activePage`.
  - `usePageActions.ts:186-211`: `updatePageSetting` = `updateConfig(userId, pageId, updates)`, then `logAction` = `recordAction`, `syncPageActionEvent` and a toast.
  - The config is `resolvePageConfig(configs[pageConfigKey(userId, pageId)])` (`src/shared/config/pageConfigStore.ts:171,198`).
- **Mechanism:** SB-2a `createStoreRecordSource`, SB-2b `combineStores`, SB-3a's app registry (`APP_ACTIONS`, `ActionDefinition`, `createActionRunner`).

**OWNS:**
- `src/features/bindings/sources/profile.ts` (new): the draft store, the source and its `$dirty` / `$conflict` pseudo-fields;
- `src/features/bindings/sources/pageSettings.ts` (new);
- `src/features/settings/profile/profileFields.ts`: receives `formErrors`, moved from the section, which then imports it;
- `src/entities/page/model/pageSettingWrite.ts` (new): `applyPageSetting({ userId, pageId, jwt, updates, action, message })`. It holds the body of `updatePageSetting` + `logAction`, and `usePageActions` calls it. The hook's behaviour is unchanged, toast included;
- `src/features/app-actions/model/actionRegistry.ts`: the `profile.save`, `profile.discard` and `profile.reload` entries;
- `src/features/bindings/sources/index.ts`: register the two sources;
- tests: `tests/canvas/profile-page-sources.test.ts` (new).

**MUST NOT TOUCH:** the stores, `accountProfileApi.ts`, the bridge, `PublicProfileSection.tsx` beyond the `formErrors` import, `usePageActions.ts` beyond calling `applyPageSetting`.

**Commit message:** `feat(bindings): profile draft with a guarded save action, and page settings as a source`

## Rules (each one is tested)

1. **Profile reads the draft.** `settings:profile` › `<field>` returns `draft[field] ?? formFromProfile(profile)[field]`; the field keys are `ProfileForm`'s, and `links` is an array. `set` writes the draft only, so nothing reaches the network. Each `FieldSpec.validate` is the matching `validate*` from `profileFields.ts`. The labels are the section's input labels, character for character.
2. **Pseudo-fields.** `$dirty` is `Object.keys(diffProfile(saved, draft)).length > 0`. `$conflict` is true after a 412 until the next reload. Both are read-only. They let a `status` block say "Unsaved changes", and `visibleWhen` show the conflict notice.
3. **`profile.save`** (confirm `"none"`, sudo `"none"`): if `formErrors(draft)` is non-empty → `failed` naming the first field, nothing sent. Otherwise `save(toPatch(diffProfile(saved, draft)))`:
   - `ok` → clear the draft, `{status:"ok", message:"Profile saved"}`;
   - `conflict` → set `$conflict`, `failed` "Someone else changed your profile. Reload to see it.";
   - `invalid` → `failed` "The server refused <label>.";
   - `unavailable` / `failed` → `failed` with the section's own wording.
   An empty diff → `ok` with nothing sent.
4. **`profile.discard`** clears the draft. **`profile.reload`** clears the draft and `$conflict`, then calls `hydrate()`. That is the section's "use the server version" (`useServerVersion`).
5. **Untrusted pages.** These three actions confirm `"none"`, so SB-3a blocks them on a page the viewer does not own. A profile draft can only be saved from the viewer's own page or a system page. Test through the test runner with `trusted: false` → `blocked`.
6. **Page settings.** `settings:page` › `font` (segmented: default, serif, mono), `smallText`, `fullWidth`, `locked` (switches), with the panel's labels. The source reads the active page's resolved config for the signed-in user. With no active page or no user → `"unavailable"`. A write calls `applyPageSetting` with the same `updates`, `action` and `message` the hook uses for that control (`usePageActions.ts:207-211`).
7. **One write path.** A spy test proves both `usePageActions`' `toggleFullWidth` (through a tiny harness, or by calling the exported function the hook delegates to) and the source's `set("fullWidth", …)` call `applyPageSetting` with identical arguments.

## Steps

- [ ] **Step 1: Failing tests** for rules 1–7 with fake stores (the store shapes above) and a spied `applyPageSetting`.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/profile-page-sources.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) `profile.save` sends the whole form instead of the diff;
  - (b) `set` on a profile field calls `save`;
  - (c) the page source writes `{ fullWidth: !current }` without `action`/`message`.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the profile e2e (`rg -l "Public profile\|PublicProfile" tests/e2e`) and the page-settings e2e pass unchanged. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the field table, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
