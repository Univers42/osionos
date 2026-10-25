# SB-2b — Settings record sources over the existing stores (self-built UI, phase S2)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Sources"). SB-2a added the mechanism: `createStoreRecordSource`, the registry, and `recordRef: "settings:<name>"` + `fieldBind`. This package registers the first real sources, so a block bound to `settings:preferences` / `weekStart` shows and changes the same value the Preferences panel does, through the same store call.

Base: the integration tip with SB-2a merged.

Scope (re-planned 2026-10-25 21:30): the five sections whose panels are plain fields over one store each. Three are left out on purpose:
- profile and page settings → SB-2d: the profile saves a draft with a Save button and If-Match, and page settings write through a React hook (`usePageActions`), so both need more than a field source;
- moderation limits and per-page notification overrides → SB-4b: they are lists.

## What exists (read these first)

| Source id | Panel (the truth for labels, options, defaults, writes) | Store / API |
|---|---|---|
| `settings:preferences` | `src/features/settings/preferences/PreferencesPanel.tsx:82-99` | `useUserPreferencesStore` (`data`, `loading`, `hydrate(userId)`, `update(patch)`) |
| `settings:accessibility` | `src/features/settings/preferences/AccessibilitySettings.tsx` | `updateAppearance(patch)` + `subscribeAppearance` (`src/shared/config/theme.ts:255,281`); read the values the way `src/shared/config/useAppearance.ts` does |
| `settings:notifications` | `src/features/settings/notifications/NotificationsPanel.tsx:60-66` | `useNotificationSettingsStore` (`update(patch)`); record fields only |
| `settings:voice` | `src/features/settings/voice/VoiceSettingsPanel.tsx:87-137` | `useVoiceSettingsStore` (`update(patch)`) |
| `settings:ai` | `src/features/settings/ai/AiPanel.tsx:24-36` | `useAiSettingsStore` (`getData(workspaceId)`, `update(workspaceId, patch)`); the workspace id comes from `useUserStore.getState().activeWorkspace()?._id ?? 'local-workspace'`, as the panel does |

**OWNS:**
- `src/features/bindings/model/combineStores.ts` (new): one store-shaped view over several stores;
- `src/features/bindings/sources/{preferences,accessibility,notifications,voice,ai}.ts` (new): one source factory each;
- `src/features/bindings/sources/index.ts` (new): registers the five app instances at module load. `BindingSourcesProvider.tsx` imports it once;
- `src/features/settings/{preferences,notifications}/options.ts` (new): the option lists and the two coupled timezone patches, moved out of the panels (see Rules 3 and 4). Each panel then imports them. That is the only panel edit allowed;
- tests: `tests/canvas/settings-sources.test.ts` (new), `tests/canvas/combine-stores.test.ts` (new).

**MUST NOT TOUCH:** the stores' code, `theme.ts`, `useAppearance.ts`, `bindingSources.ts` (SB-2a's), the bridge. Any other panel line.

**Commit message:** `feat(bindings): preferences, accessibility, notifications, voice and AI as record sources`

## Interfaces

```ts
// combineStores.ts
type StoreLike<S> = { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };
function combineStores<M extends Record<string, StoreLike<unknown>>>(stores: M): StoreLike<{ [K in keyof M]: ReturnType<M[K]["getState"]> }>;

// each sources/<name>.ts
function createPreferencesSource(deps: { prefs: StoreLike<UserPreferencesStoreState>; user: StoreLike<UserStoreState> }): RecordSource;
// …likewise createAccessibilitySource, createNotificationsSource, createVoiceSource, createAiSource
```

## Rules (each one is tested)

1. **`combineStores`.** `getState()` returns the SAME object until one of the stores changes; then a new `{ name: state, … }` object. A listener receives `(next, previous)` combined snapshots. It subscribes to the underlying stores on the first listener and releases them all after the last. Test both, counting the fakes' active listeners.
2. **Field keys.** A flat value uses its key (`weekStart`). A nested value uses a dotted path (`privacy.viewHistory`, `desktop.openOnStart`, `email.<key>`, `inApp.liveMeetingActivity`, `slack.mode`, `discord.mode`). Every control the five panels show today is a field, and nothing else. Each `FieldSpec.label` is the panel control's accessible label, character for character (`"Use Enter to add a new line"`), and `display` matches the control (Toggle → `switch`, Dropdown → `dropdown`, MiniTabs → `segmented`, select → `dropdown`, range → `number`).
3. **Read = what the panel shows.** `read` returns each field's value with the panel's own default (`privacy.viewHistory ?? true`, `weekStart ?? 'monday'`, `email[key] ?? key !== 'alwaysSend'`, …). Test: with empty data, every field's `get` equals the panel's default; list them in the test.
4. **Write = the panel's exact call.** `set(field, value)` sends the same patch the panel's control sends: nested values merge into the current object (`update({ privacy: { ...data.privacy, viewHistory: v } })`). The two coupled timezone writes (`PreferencesPanel.tsx:90-91`) are named functions in `preferences/options.ts`, and both the panel and the source call them. The option lists (number format, start week, date format, open on start, Slack and Discord modes) move to the `options.ts` files and are imported by both. One copy each. AI writes `update(workspaceId, patch)` with the active workspace's id; accessibility writes `updateAppearance`, mapping hovercards `true/false` → `'on'/'off'` as `AccessibilitySettings.tsx:45` does.
5. **Spy tests.** For each source, the test builds it over fake stores whose write action is a spy. For each field, it asserts one call with exactly the patch the panel sends. For AI, it also asserts the workspace id. The fakes keep the stores' real shape (`getState`/`subscribe`/`setState`).
6. **Viewer scope.** With no signed-in user (`user.activeUserId` empty), every source's `read` returns null and reports `"unavailable"`, accessibility and voice included. Preferences and notifications report `"loading"` while their store's `loading` is true. `load()` calls `hydrate(activeUserId)` (preferences, notifications) and never `hydrate('anonymous')`.
7. **Per-field cost.** A change to one preference calls only that field's listeners. Test it on the real factories with fake stores: two listeners on `weekStart` and `privacy.viewHistory`; `update({ weekStart: 'sunday' })` calls one listener once.
8. **Registration.** `sources/index.ts` registers exactly the five ids above, once. A test lists them through `listRecordSources()`.

## Steps

- [ ] **Step 1: Failing tests** for rules 1–8 in the two new test files.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/settings-sources.test.ts tests/canvas/combine-stores.test.ts`.
- [ ] **Step 3: Implement** `combineStores`, then the five factories, the options modules (the panels import them), and the registration.
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) `combineStores.getState` builds a new object on every call;
  - (b) the preferences source writes `{ viewHistory: v }` at the top level instead of merging into `privacy`;
  - (c) the AI source ignores the workspace id;
  - (d) the no-user check is removed.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the settings e2e that cover these panels (`rg -l "Preferences|Notifications|Voice|Accessibility" tests/e2e/functional`, at least `settingsKit` and the preferences spec) pass unchanged. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the field table (source id, field key, label, display, default), the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
