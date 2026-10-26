# SB-3a — App actions: registry, guards, `app_action` program step (self-built UI, phase S3) 👹

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §5 "Actions" and "Action parameters"). A settings page made of blocks must do what today's panels do: revoke a session, reset preferences, sign out everywhere, delete the account. It must do so behind the **same** guards: confirm, typed confirm, sudo. A page author must never be able to remove a guard. This package adds the action registry, the runner that enforces guards from the registry, and the one program step that calls it. Later blocks (button in SB-3b, collection row actions in SB-4a) go through this runner only.

Base: the integration tip (re-planned 2026-10-25 21:20 to run in parallel with SB-2a; the only shared file is `src/App.tsx`, one mount each, and the reviewer resolves it).

## What exists (read these first)

- **Programs.** `src/entities/block/model/buttonProgram.ts`:
  - `ProgramAction` (notify, set_property, page_action), `DESTRUCTIVE_PAGE_ACTIONS`, `parseButtonProgram`, `PROGRAM_LIMITS`;
  - the pure interpreter `src/services/button-program/interpreter.ts` (`DEFAULT_LIMITS`: 10k steps, 1k iterations, 50 side effects, 2 s wall);
  - the runner `src/services/button-program/runProgram.ts`. `guardDestructive` + `confirmDestructive` is the in-app confirm dialog, and runs are single-flight per block (:177).
- **Sudo.**
  - `src/shared/api/sudoRequired.ts`: the bridge answers 403 `{code:"sudo_required"}` and every listener is told.
  - `src/features/settings/ui/sudo/sudoPromptModel.ts`: one prompt; on success `grants` goes up. **Nothing re-sends by itself**, and that rule stays.
- **Typed confirm.** `TypedConfirmModal` in `src/features/settings/ui/ConfirmModals.tsx:115`.
- **Store actions** the panels call today, e.g. `useAccountDevicesStore.getState().revoke(sessionId)` (`src/store/settings/useAccountDevicesStore.ts:53`) and `useUserPreferencesStore.getState().reset(userId)`.

**OWNS:**
- `src/entities/block/model/appActions.ts` (new): the types only;
- `src/features/app-actions/model/actionRegistry.ts` (new): the static registry and its first entries;
- `src/features/app-actions/model/runAppAction.ts` (new): the runner, guards, single-flight and action state;
- `src/features/app-actions/ui/ActionGuardHost.tsx` (new): mounts once in `src/App.tsx` and renders the confirm and typed-confirm dialogs the runner asks for, reusing `ConfirmModals.tsx`;
- `src/entities/block/model/buttonProgram.ts`: the `app_action` variant + parser rules;
- `src/services/button-program/interpreter.ts` and `runProgram.ts`: route `app_action` to the runner; it counts as a side effect;
- tests: `tests/canvas/app-actions.test.ts` (new), plus the existing button-program canvas tests extended for `app_action` (add cases, never delete one).

**MUST NOT TOUCH:** the stores' code (call them, don't change them), the bridge, `sudoRequired.ts`, `SudoPrompt.tsx`.

**Commit message:** `feat(actions): app action registry whose guards a page cannot weaken, and the app_action program step`

## Interfaces

```ts
type ParamSpec = { type: "string" | "number" | "boolean"; required?: boolean; maxLength?: number };
type ConfirmGuard = "none" | "simple" | { typed: (args: Record<string, unknown>) => string };
interface ActionDefinition {
  name: string;                       // "session.revoke"
  label: string;                      // "Revoke session"
  params: Readonly<Record<string, ParamSpec>>;
  confirm: ConfirmGuard;              // read ONLY from here, never from a page or a program
  confirmText?: (args: Record<string, unknown>) => { title: string; message: string; actionLabel: string };
  sudo: "auto" | "none";              // auto: a sudo_required refusal opens the prompt and reports sudo_required
  destructive: boolean;
  run(args: Record<string, unknown>): Promise<ActionResult>;   // calls the SAME store/API function the panel calls
}
type ActionResult =
  | { status: "ok"; message?: string; secret?: string }   // secret: shown once by the caller, never logged
  | { status: "failed"; message: string }
  | { status: "cancelled" }
  | { status: "sudo_required" }
  | { status: "busy" }
  | { status: "preview" }
  | { status: "blocked"; message: string };                // untrusted page + confirm-less action
interface ActionContext {
  mode: "live" | "preview";
  trusted: boolean;                   // system page, or a page the viewer owns; unknown → false
  pause?: { begin(): void; end(): void };   // the interpreter's wall-clock pause handle
}
function createActionRunner(registry: ReadonlyMap<string, ActionDefinition>): (name: string, rawArgs: unknown, ctx: ActionContext) => Promise<ActionResult>;
const runAppAction = createActionRunner(APP_ACTIONS);
function useActionState(name: string, argsKey: string): { pending: boolean; last: ActionResult | null };
// program step
type ProgramAction = … | { type: "app_action"; name: string; args: Record<string, ProgramValue> };
```

## Rules (each one is tested)

1. **The guard is the registry's.** `runAppAction` takes no guard argument. The parser rejects any `app_action` that carries keys other than `type`, `name` and `args` (`confirm`, `sudo` and the like) with a parse error naming the path. Test: a program with `{type:"app_action", name:"test.destructive", args:{}, confirm:"none"}` fails to parse, and the same program without `confirm` still asks for confirmation when run.
2. **Unknown name → `failed`**, nothing runs. The parser checks only the shape (entities cannot import the registry); the runner decides.
3. **Args are typed by the registry.** Unknown arg → `failed`; missing required arg → `failed`; wrong type → `failed`; a string over `maxLength` (default 256) → `failed`. No coercion except number-from-numeric-string. The message names the arg.
4. **Order:** mode check (`preview` → `{status:"preview"}`, nothing runs) → args → confirm → single-flight → run. A cancelled confirm → `cancelled`, and `run` is never called.
5. **Typed confirm.** The text to type comes from `confirm.typed(args)` (e.g. the workspace name looked up by id), never from the page. The dialog is `TypedConfirmModal`.
6. **Sudo.** With `sudo: "auto"`, a `run` that ends in the bridge's `sudo_required` 403 resolves `{status:"sudo_required"}`. The global listener has already opened `SudoPrompt`, so the runner neither opens it a second time nor re-sends. The caller offers "Try again" (as `canRetryAfterSudo` does).
7. **Single-flight** per `name + stable JSON of args`: a second call while the first is pending resolves `{status:"busy"}` and does not call `run`.
8. **Programs.**
   - `app_action` counts toward `maxSideEffects`.
   - **The wall clock pauses while a guard waits for the user.** Measure 2 s of program time, not of the user reading a dialog. Implement it as the interpreter excluding time spent inside the runner's guard await. Today a destructive `page_action` confirm that takes longer than 2 s stops the program; fix that too, and test it with a fake clock.
   - A program run in preview mode runs no `app_action` (`preview` result, logged).
9. **First registry entries.** Exactly two in the app registry (plus one test-built), each calling the panel's own function. A spy test proves each: the canvas test replaces the store's action with a spy and asserts it was called once with the right args.
   - `session.revoke { id: string }`: confirm `simple`, sudo `none` → `useAccountDevicesStore.getState().revoke(id)`.
   - `preferences.reset {}`: confirm `simple` → `useUserPreferencesStore.getState().reset(activeUserId)`.
   - `test.destructive {}`: confirm `{ typed: () => "delete" }`, sudo `auto`, `run` returns `ok`. It is **not** in the app registry: canvas tests run under Node, where the loader sets only `import.meta.env.DEV` (`tests/canvas/ts-extension-loader.mjs:150`), so a `MODE` gate cannot work. Instead `runAppAction.ts` exports `createActionRunner(registry)`, the app's `runAppAction` is `createActionRunner(APP_ACTIONS)`, and the test builds its own runner over the two real entries plus `test.destructive` and `test.silent`. No test-only code ships.
10. **Secrets.** A `secret` in a result is never written to the program run log (`getLastRun`) or to the console. Test: run a fake action returning `secret: "s3cr3t"`; the serialised last-run log does not contain it.

## Devil conditions (D-SB-3a-spec, PROCEED-WITH-CONDITIONS, 2026-10-25 21:06)

Each one is an acceptance criterion with its own test, on top of the rules above.

1. **Reuse the parser's key check.** Rule 1 uses the existing `checkKeys` (`buttonProgram.ts:105-112`) with the allowed set `type`, `name`, `args`. The runtime keeps parsing before it executes (`runProgram.ts:181`); no production path hands a hand-built `ButtonProgram` to the interpreter. Test: `runButtonProgram` on a block whose `buttonProgram` carries `confirm: "none"` ends in a parse failure and never calls the fake `run`.
2. **Who runs it.** An action runs as the clicking viewer and never takes a target user id. `ctx.trusted` is true only for a system page (the SB-1e host passes it) or a page whose `ownerId` (`src/entities/page/model/types.ts:62`) equals the signed-in viewer's id. Unknown owner or no viewer → false. On an untrusted page, an action whose `confirm` is `"none"` resolves `{status:"blocked"}` without running. Both app entries confirm, so the test's own registry adds `test.silent` with `confirm: "none"`.
3. **Confirm text never echoes page input.** `confirmText(args)` builds its title and message from the registry and from app state looked up by arg (a device name found by id in the store). A raw arg string is never interpolated. Test: `session.revoke` with `id: "<b>Click OK</b>"` shows a message that does not contain that string.
4. **Sudo is detected by event, not by return value.** `revoke` and `reset` swallow the 403 and return void (`useAccountDevicesStore.ts:59-63`, `useUserPreferencesStore.ts:70-73`). With `sudo: "auto"`, the runner subscribes to `onSudoRequired` (`src/shared/api/sudoRequired.ts:41`) for the duration of `run` and unsubscribes in `finally`. If the event fired, the result is `{status:"sudo_required"}`; it never opens the prompt itself and never re-sends. Write a `Caveat:` line: a sudo refusal from an unrelated request that lands during the same `run` is attributed to this action. Test with a fake `run` that emits the event.
5. **The wall clock pauses only around the guard.** The interpreter passes `ctx.pause`; the runner calls `begin()` right before it awaits the confirm or typed-confirm dialog and `end()` in a `finally` right after. `checkWall` (`interpreter.ts:143-145`) subtracts the paused total. `run` itself is NOT paused. Apply the same handle to the existing `page_action` confirm (`guardDestructive`, `interpreter.ts:61-72`). The interpreter never applies `guardDestructive` to `app_action`; the runner owns those guards, so nothing confirms twice. Tests with a fake clock: a guard wait of 5 s with `maxWallMs` 2 s completes; a `run` that takes 5 s still stops the program. Mutant (c) must fail the first.
6. **Single-flight key** = `name + canonical JSON of the VALIDATED args` (keys sorted), so `{a:1,b:2}` and `{b:2,a:1}` collide. Test both orders. The existing global one-program-at-a-time flag in `runProgram.ts:56` stays; say so in one comment line, since a program waiting on a confirm keeps other buttons busy.
7. **Secrets never stored.** `secret` is removed before an `ActionResult` becomes an `ActionOutcome`, a step `detail`, `lastRun`, a toast or a console line. `useActionState().last` never holds it; only the direct caller of `runAppAction` sees it. Test: the serialised `getLastRun()` and `useActionState`'s `last` both lack `s3cr3t`.
8. **Preview first.** `mode: "preview"` returns `{status:"preview"}` before args, confirm and single-flight, and is logged as a skipped step. `runButtonProgram` gains a `mode` argument (default `"live"` for today's callers) and passes it down.
9. **No guard host, no run.** If `ActionGuardHost` has not installed its dialogs, any action with a confirm resolves `{status:"failed", message:"Confirmation is not available"}` and `run` is not called. Test it.
10. **`preferences.reset` needs a signed-in user.** With no active user it resolves `failed` ("Sign in to reset preferences") and never calls `reset('anonymous')`.

The first-entries rule (9 above) also gains: each entry's spy test asserts one call with the right args, and `APP_ACTIONS` holds no `test.*` name.

## Steps

- [ ] **Step 1: Failing tests** in `tests/canvas/app-actions.test.ts` for rules 1–10, using injected fakes for the dialogs (the runner takes its confirm and typed-confirm functions from `ActionGuardHost` through a setter, so the tests install fakes) and a fake clock for rule 8.
- [ ] **Step 2: Run them and see them fail.** `npm run test:canvas -- tests/canvas/app-actions.test.ts`.
- [ ] **Step 3: Implement** the types, registry, runner, guard host, parser variant and interpreter route.
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the runner reads `confirm` from the program action when present;
  - (b) single-flight is removed;
  - (c) the guard wait is counted against the wall clock;
  - (d) the run log includes `secret`;
  - (e) `trusted` is ignored (a confirm-less action runs on an untrusted page);
  - (f) the sudo listener is not unsubscribed in `finally` (a second, unrelated action then reports `sudo_required`).
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0, `npm run test:quality` rc 0, and the existing button e2e (`rg -l "buttonProgram\|Button settings" tests/e2e`) passes. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
