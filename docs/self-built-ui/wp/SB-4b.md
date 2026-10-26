# SB-4b — The first list sources (sessions, passkeys) and the `item-list` component (self-built UI, phase S4)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Sources", §6 "item list, data table", §9). SB-4a made the `collection` block and the `ListSource` interface. This package proves them on the two account lists with row actions, sessions and passkeys, against today's rows from the same bridge stub, and ships the `item-list` component the other lists will reuse. Every other settings list gets its source in the S5 package of the section that shows it, so each section stays one self-contained change.

Base: the integration tip with SB-4a and SB-4e merged.

## What exists (read these first)

- **Sessions:** `src/features/settings/profile/SessionsSettings.tsx` (all 86 lines: `HEADERS`, `sessionCells`, `Groups`, the "This device" chip, the revoke button's `aria-label`, the empty and unavailable states); `sessionClient.ts` (`deviceName`, `groupSessions`, `classifyClient`, `CLIENT_KIND_LABELS`); `useAccountDevicesStore` (`data`, `status`, `error`, `hydrate(userId)`, `revoke(id)`).
- **Passkeys:** `PasskeyManagerModal` (`ProfileSecurityModals.tsx:122-140`: the bordered list, the name input, the dates line, Remove); `useAccountPasskeysStore` (`data`, `loading`, `error`, `hydrate`, `rename`, `remove`).
- **Their e2e:** `tests/e2e/bridge-stub/sessionsPanel.spec.mjs`, the passkey case in `twoStepVerification.spec.mjs:159`, and the stubs they use. They stay green unchanged.
- **Mechanism:** `createStoreListSource`, `registerListSource`, the `collection` block with `groupBy` and column templates, `$row`, row actions with `prop("$row.<field>")` (SB-4a); `session.revoke` (SB-3a); the components mechanism and `src/system-docs/components/` (SB-4e); presets and their parity test (SB-4f).

**OWNS:**
- `src/features/bindings/sources/lists/sessions.ts` and `lists/passkeys.ts` (new) + registration;
- `actionRegistry.ts` (modified): `passkey.remove`;
- `src/system-docs/components/item-list.json` (new): the `item-list` component;
- presets added to `presets/settings.json` for the item list (through SB-4f's parity test), and any token-backed scale value they need (SB-4f Rule 4's discipline: list each one);
- the registered button (modified): `buttonAriaField?: string` (Rule 4);
- tests: `tests/canvas/list-sources.test.ts`, `tests/e2e/bridge-stub/listSources.spec.mjs` (new).

**MUST NOT TOUCH:** `SessionsSettings.tsx`, `ProfileSecurityModals.tsx`, the stores, `sessionClient.ts` (call it), the bridge, the existing e2e.

**Commit message:** `feat(bindings): sessions and passkeys as list sources, and the item-list component`

## Rules (each one is tested)

1. **`list:sessions`.** Over `useAccountDevicesStore`: `rowKey` `id`; status from the store's `status` (`unavailable` → `"unavailable"`, `loading` → `"loading"`, `error` → `ready` with `error` set); `loadMore` absent (the bridge caps the list at 50, the store's Caveat). Fields (the spec labels are today's headers): `device` ("Device", `deviceName(userAgent)`), `current` (boolean), `signedIn` ("Signed in", `new Date(createdAt).toLocaleString()`), `network` ("Network", `ipPrefix ?? "Unknown network"`), `method` ("Sign-in method", today's `sentenceCase(authMethod)`), `kind` (options `web`/`desktop`/`mobile` with `CLIENT_KIND_LABELS`, from `classifyClient`), `revokeLabel` (`Revoke session: <device>` plus ` (this device)` when current). Derived values are computed once per row object and cached by row identity, so SB-4a's stable-row rule holds.
2. **`list:passkeys`.** Over `useAccountPasskeysStore`, rows without `removedAt` only: `rowKey` `_id`; `nickname` (display `text`, label "Passkey name", writable through `update` → `rename(id, value)`), `dates` (`Created <date> · Last used <date or "Never">`, today's format). `update` resolves `{ ok: false, error }` when the store's `error` is set after the call.
3. **`passkey.remove`.** `params { id: string }`, `confirm: "simple"` (`confirmText` names the passkey by its nickname looked up by id, never the raw arg), `destructive: true`, run = `remove(id)`, `failed` with the store's error when it is set after the call. Spy test: one `remove("<id>")` after confirm, none after cancel. Today's modal removes without asking; the confirm is a deliberate change (a page must not remove a passkey on one click), recorded in the report.
4. **Named row buttons.** Today the revoke button's accessible name is `Revoke session: <device>` plus ` (this device)`. The registered button gains `buttonAriaField?: string`: inside a row, `aria-label` = `String(row[buttonAriaField])`; outside a row or with an empty value, it is ignored and the visible label names the button. The field name is checked against the source's fields; a page cannot inject other text.
5. **The sessions table, rebuilt.** A test page holds a `collection` over `list:sessions` (`display: "table"`, `groupBy: "kind"`, columns Device with a template — a paragraph bound to `$row` › `device` and a `chip` "This device" with `visibleWhen` on `current` — then Signed in, Network, Sign-in method), a revoke button running `session.revoke` with `args: { id: { formula: 'prop("$row.id")' } }` and `buttonAriaField: "revokeLabel"`, and an empty slot holding the `empty-state` component with today's copy ("No other sessions", "Sessions you start on other devices show up here."). Against the same stub as `sessionsPanel.spec.mjs`, the e2e asserts the same group headings in the same order, the same row count per group, the same cell texts, the same button names, and that Revoke sends the same `DELETE /api/account/sessions/<id>` after the confirm.
6. **The passkey list, rebuilt** with the `item-list` component: same rows and texts as the modal from the same stub, the name editable inline (blur writes `rename`), Remove asking first.
7. **`item-list`.** A component (SB-4e) wrapping a `collection` (`display: "list"`, `dividers`) in a bordered panel with today's look: `rounded-[var(--osio-radius-panel)] border border-[var(--osio-db-line)]` and `divide-[var(--osio-db-line-soft)]` between rows (`ProfileSecurityModals.tsx:127`), rows padded `px-3 py-2`. Props: `source`, `emptyTitle`, `emptyHint`. Slots: `row` (the row template), `empty`. Its computed styles match the modal's list through SB-4f's parity check, light and dark.

## Steps

- [ ] **Step 1: Failing tests.** Canvas: each source's fields and derived values from fake stores (character for character with today's cells), status mapping, row identity across an unrelated store change, `update`'s failure path, Rule 3's spy, Rule 4's name rule. e2e (`PLAYWRIGHT_BRIDGE_STUB=1`): Rules 5–7.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/list-sources.test.ts`; `PW_BROWSER_SOURCE=system PLAYWRIGHT_BRIDGE_STUB=1 bash scripts/docker-run.sh test-e2e tests/e2e/bridge-stub/listSources.spec.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) `revokeLabel` drops " (this device)";
  - (b) derived values are recomputed into new row objects on every snapshot;
  - (c) `passkey.remove`'s confirm text echoes the id;
  - (d) `buttonAriaField` reads a field the source does not declare.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; `sessionsPanel.spec.mjs` and `twoStepVerification.spec.mjs` unchanged and green. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations, including Rule 3's added confirm), the presets and scale values added, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
