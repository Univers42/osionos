# SB-4h — Kernel flows: the `steps` container, the `qr` block and the guarded two-step verification flow (self-built UI, phase S4b) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §6 "2FA enrolment", and "No widgets": whatever needs a browser API or holds a secret lives in the kernel, and the page only places and triggers it). Two-step verification is today `TwoFactorModal.tsx`: start enrolment, scan a QR code, type a 6-digit code, see recovery codes once, turn it off, order the methods. Its intermediate values are secrets: the `otpauth://` URL holds the TOTP seed, and the recovery codes sign you in. This package adds the mechanism that lets a page draw that flow without ever holding those values: a **flow** is a kernel state machine with its own actions and its own short-lived state, and a page's `steps` container only shows the step the flow is in.

👹 because it handles an authentication factor, session tokens and one-time secrets.

Base: the integration tip with SB-3b, SB-3c and SB-2c merged (buttons on the action runner, the `secret` block, the `field` block; SB-3a's runner and SB-2a's bindings come with them).

## What exists (read these first)

- **Today's flow:** `src/features/settings/profile/TwoFactorModal.tsx` (all of it, 142 lines) and `twoStepClient.ts` (`startEnrolment`, `confirmEnrolment(code)`, `createRecoveryCodes`, `disableTwoStep`, `adoptSessionToken`, `dropSessionAfterStepUp`, `RECORD_UNAVAILABLE`, `SIGNED_OUT_NOTICE`, `useTwoStepStatus`), `twoStepMethods.ts` (`METHOD_LABELS`, `orderedMethods`), `settingsCalls.ts` (`AccountActionOutcome`, `accountActionNotice`), `SESSION_REVOKED_CODE` (`src/shared/api/sessionRevocation.ts`).
- **Its tests:** `tests/e2e/bridge-stub/twoStepVerification.spec.mjs` (E1–E3 among them) and `tests/e2e/support/twoStepStub.mjs`. They must stay green unchanged: this package adds the flow beside the modal and deletes nothing. SB-5-profile swaps the modal for the document later.
- **Actions:** `ActionDefinition`, `createActionRunner`, `ActionContext`, the confirm/sudo guards and the secret stripping (`src/features/app-actions/model/`, `src/entities/block/model/appActions.ts`); `sudoHint` (SB-3b).
- **Scopes that already pass through a run:** `row` (SB-4a, if merged) and `mode`; `runButtonBlock(block, hostPageId, { mode, onSecret })` (SB-3b).
- **Bindings:** `useBoundField(recordRef, field)` and its reserved scopes (`$record`, `$viewedUser`, `settings:<name>`, `$row`).
- **`qrcode`** is a dependency, already loaded lazily by the modal (`await import('qrcode')`).

**OWNS (all new unless marked):**
- `src/features/flows/model/flowRegistry.ts`: `FlowDefinition`, `FLOWS`, `createFlowRuntime`;
- `src/features/flows/model/twoStepFlow.ts`: the `twostep` flow;
- `src/features/flows/model/flowScope.tsx`: `FlowScopeProvider`, `useFlowScope`;
- `src/entities/block/registered/steps/StepsBlock.tsx`, `src/entities/block/registered/qr/QrBlock.tsx` + registry entries, the `steps` and `qr` `BlockType`s, `steps?: { flow: string }` and `stepId?: string` in `types.ts`, their page-file keys, category rows, slash entries, allowlists, height estimates. Both blocks load lazily (design §11 point 8);
- `bindingSources.ts` (modified): the `"$flow"` branch of `useBoundField` only;
- `runAppAction.ts` / `appActions.ts` (modified): `ActionContext.flow?: FlowHandle` passed through to `run`, nothing else;
- `runProgram.ts` and the registered `ButtonBlock.tsx` (modified): pass `useFlowScope()?.handle` as `flow`;
- tests: `tests/canvas/flows.test.ts`, `tests/e2e/bridge-stub/twoStepFlow.spec.mjs`.

**MUST NOT TOUCH:** `TwoFactorModal.tsx`, `twoStepClient.ts` (call it), the bridge, the existing two-step e2e and its stub (read the stub; extend it only by adding routes, never changing one).

**Commit message:** `feat(flows): kernel flows with a steps container, and two-step verification as a guarded flow`

## Interfaces

```ts
interface FlowDefinition<V extends Record<string, unknown>> {
  id: string;                                       // "twostep"
  steps: readonly string[];                         // "loading", "unavailable", "off", "scan", "codes", "on"
  initial(): Promise<{ step: string; values?: Partial<V> }>;   // reads today's status source
  fields: Readonly<Record<keyof V & string, FieldSpec & { secret?: boolean }>>;
  writable: readonly (keyof V & string)[];          // fields a page control may write: "code" only
  actions: Readonly<Record<string, ActionDefinition>>;         // registered as "<flow>.<name>"
}
interface FlowHandle {                              // what an action's run receives in ctx.flow
  step(): string;
  get<K extends string>(field: K): unknown;
  set(field: string, value: unknown): void;         // kernel only; pages go through `writable`
  go(step: string, values?: Record<string, unknown>): void;   // replaces the values, see Rule 3
}
function createFlowRuntime(def: FlowDefinition<any>): { handle: FlowHandle; subscribe(l: () => void): () => void; dispose(): void };
```

## Rules (each one is tested)

1. **The flow is the kernel's.** A page cannot define a flow, a step, a transition or a flow action. `steps.flow` must name a registered flow (strict system-doc parse rejects others; lenient lists `"<id>.steps"`). A child frame's `stepId` must be one of that flow's steps, else it never renders. A flow action is reachable only as `app_action` `"<flow>.<action>"` from a button INSIDE a `steps` container of that flow: with no `ctx.flow`, or a `ctx.flow` of another flow, the runner returns `blocked` before args or confirm. Test both.
2. **Only the current step is mounted.** `StepsBlock` renders exactly the child frames whose `stepId` equals `handle.step()`; the others are not in the DOM. On a step change, focus moves to the new step's first heading (or its first focusable element), and an `aria-live="polite"` region names the step.
3. **Secrets live only in the runtime, and only for their step.** Fields marked `secret` (`otpauthUrl`, `codes`) are kept in the runtime's memory, never in action state, `getLastRun()`, a toast, the console or a block. `go(step, values)` REPLACES the values, so leaving `scan` drops `otpauthUrl` and leaving `codes` drops `codes`. `dispose()` (the container unmounting) clears everything. Tests: after each transition and after dispose, the runtime's values hold no secret from an earlier step; serialising `getLastRun()` and the action state after a full enrolment contains neither the seed nor any code.
4. **Bindings.** `useBoundField("$flow", field)` inside a container reads `handle.get(field)` with the field's spec, and offers `set` only for `writable` fields (`code`). A `secret` field is readable only by the `qr` block (`otpauthUrl`) and a list of codes rendered as text in the `codes` step (the `secret` block, SB-3c, or a paragraph list). Any other block bound to a secret field renders the muted placeholder. Outside a container → `"unavailable"`.
5. **The `qr` block.** It renders `<img alt={qr.alt ?? "QR code"}>` from `QRCode.toDataURL(value)` (lazy import), 160 px square by default, as the modal does. The URL string is never in DOM text or any attribute other than the image's `data:` source. Test: the page's `outerHTML` after the scan step contains no `otpauth://`.
6. **The `twostep` flow reproduces the modal, call for call.** Actions (all `confirm: "none"`; they are only reachable from inside the container, Rule 1):
   - `twostep.start`: `startEnrolment()`; ok with `otpauthUrl` → `go("scan", { otpauthUrl })`; ok without it → `failed` "The server sent no setup key."
   - `twostep.confirm`: reads `code` from the flow (never from args; the action takes no args), requires 6 digits, then `confirmEnrolment(code)`. On `RECORD_UNAVAILABLE` or `SESSION_REVOKED_CODE` → `dropSessionAfterStepUp(userId)` and `failed` with `SIGNED_OUT_NOTICE`. On ok → `adoptSessionToken(userId, accessToken, refreshToken)`, then `createRecoveryCodes()`; codes → `go("codes", { codes })`; none → `go("on")` with today's info toast.
   - `twostep.recovery`: `createRecoveryCodes()` → `go("codes", { codes })`.
   - `twostep.done` ("I saved these codes"): `go("on")`.
   - `twostep.disable`: `confirm: "simple"`, the modal's E2 behaviour (adopt the returned pair; drop the session on the two codes above), then `go("off")` and today's success toast.
   - `twostep.cancel`: `go(<initial step>)`, dropping every value.
   - `sudo_required` from any of them → the result carries `sudoHint` "Confirm it's you first, then press the button again." (`TwoFactorModal.tsx:23`); `unavailable`/`failed` → `accountActionNotice(outcome, label)?.description` with the modal's labels.
   A spy test per action asserts the same `twoStepClient` function is called with the same arguments as the modal, in the same order.
7. **The code field.** A `field` bound to `$flow` › `code` (display `text`, `inputMode="numeric"`, label "6-digit code") keeps only digits, at most 6, as the modal's `onChange` does. Verify stays disabled until 6 digits (a `visibleWhen` or the button's own disabled rule; say which).

## Steps

- [ ] **Step 1: Failing tests.**
  - Canvas (`flows.test.ts`): the runtime (step changes, value replacement, dispose, subscribe); Rule 1's `blocked` cases; Rule 3's leak checks; Rule 4's placeholder for a secret field; each Rule 6 spy, with the outcome codes from `twoStepClient.ts`.
  - e2e (`bridge-stub/twoStepFlow.spec.mjs`, `PLAYWRIGHT_BRIDGE_STUB=1`, the existing stub): a test page with a `steps` container of the `twostep` flow and one frame per step: Set up → the QR image shows and the HTML has no `otpauth://` → type the code → recovery codes shown once → "I saved these codes" → the codes are gone from the DOM → Turn off with its confirm. Plus E3's dropped session on a 503 `session_record_unavailable`, and a sudo 403 showing the hint.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/flows.test.ts`; `PW_BROWSER_SOURCE=system PLAYWRIGHT_BRIDGE_STUB=1 bash scripts/docker-run.sh test-e2e tests/e2e/bridge-stub/twoStepFlow.spec.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) `go` merges values instead of replacing them (the seed survives the scan step);
  - (b) a flow action runs with no `ctx.flow`;
  - (c) `twostep.confirm` takes the code from args;
  - (d) the `qr` block puts the URL in a `title`.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the existing `twoStepVerification.spec.mjs` unchanged and green; `ANALYZE=1 npm run build`: `qrcode` and both blocks stay out of the warm chunk (paste the chunk names). Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the spy table (action → client call), the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
