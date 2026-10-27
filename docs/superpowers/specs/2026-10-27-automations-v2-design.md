# Automations v2 — design spec (Phase 1)

Status: approved design (artifact 566cd21c, 2026-10-26; owner chose every
recommended option), turned into contracts on 2026-10-27.

## Why

Read on `main` 9a0b7c41f (`lib/automations/automationRunner.ts`,
`store/slices/pageAutomations.ts`, `viewSettings/Automation*.tsx`):

- "+ New automation" stores an enabled `row_updated → notify` rule before the
  user chooses anything.
- `notify` dispatches `nds:automation-fired` in the editing tab only
  (`useDatabaseAutomationBridge.ts:37`): a toast for whoever made the edit.
- `set_property` writes a constant; no formula, no "today", no "+ 1".
- One condition, no "changes from → to".
- No run history, no error, no test: a broken rule looks like a working one.
- Rules live in `view.settings.automations` though they belong to the
  database; `runLocalAutomations` already unions them across views.
- Buttons run a budgeted multi-step interpreter
  (`src/services/button-program/interpreter.ts`); automations run a second,
  weaker planner.

## Decisions (owner, 2026-10-26)

1. One engine: trigger + conditions + `ButtonProgram`. The v1 planner and rule
   format are migrated and removed.
2. Phase 1: row added, property changes (optional from → to), row deleted,
   button pressed; the editor, steps, run history and test run. Phase 2: date
   and schedule triggers (bridge scheduler).
3. Server runs act as the rule owner.
4. The editor is a sheet beside the database; full screen below 640 px.

## Data model

Stored on the database, not the view: `DatabaseSchema.automations?: AutomationRuleV2[]`.

```ts
type AutomationTrigger =
  | { type: 'row_added' }
  | { type: 'property_changed'; propertyId?: string; from?: unknown; to?: unknown }
  | { type: 'row_deleted' };

interface AutomationRuleV2 {
  version: 2;
  id: string;
  name: string;
  enabled: boolean;
  ownerId: string | null;          // who saved it; null for migrated v1 rules
  trigger: AutomationTrigger;
  conditions: Filter[];            // the view filter rule type, reused
  conjunction: 'and' | 'or';
  program: ButtonProgram;          // the button program, reused
  updatedAt: string;
}
```

- `propertyId` absent = any property. `from`/`to` absent = any value. For
  select/status they hold option ids. A value matches through
  `matchesFilterValue(value, { operator: 'equals', value: to })`
  (`lib/filter/evaluateFilter.ts:98`), the comparison the view filters use
  (loose equality, same-day dates), never `===` on objects.
- A rule in the editor that was never saved is a draft held in the sheet's
  state. Nothing is written to the database until Save, so a half-built rule
  never runs.

## Where the steps run

`buttonProgram.ts` (model + strict parser) and `interpreter.ts` are pure and
value-import nothing. They move into the engine at
`src/shared/notion-database-sys/src/lib/program/`. The app keeps its paths as
re-exports, so `@/entities/block/model/buttonProgram` and
`@/services/button-program/interpreter` callers do not change. Reason: the
engine runs automations inside its store and may not import app code; the
app may import the engine.

New program actions (parser and step editor extended, additive):

| action | fields | runs |
|---|---|---|
| `add_row` | `databaseId`, `values: Record<propertyId, ProgramValue>` | engine store `addPage` |
| `notify_people` | `people: ProgramValue` (person ids), `message` | host adapter → bridge |
| `webhook` | `url` | existing SSRF-guarded transport |

Formulas read `trigger.row` (the row's properties), `trigger.before` (for
`property_changed`) and `trigger.user`.

## Runner

`lib/automations/runAutomations.ts` (engine) replaces `planAutomations` and
`runLocalAutomations`:

```ts
runAutomations(event: AutomationEventV2, ctx: AutomationHost): Promise<AutomationRun[]>
```

- Match: `enabled`, trigger type, `propertyId`, `from`/`to`, then the
  conditions through the same `matchesFilterValue` the views use. A
  half-built condition (an operator still waiting for its value) never
  holds: a view skips one, but a rule that skipped it would run on every row.
- The program reads the row through the host's `propsOf(event)`, which knows
  the schema (property ids → names for the formulas).
- Run: `runButtonProgram(rule.program, ctx)` with the default budgets
  (10,000 steps · 1,000 loop turns · 50 writes · 2 s).
- Chains: a write made by a run may trigger rules again, to depth 3. The same
  (rule, row) pair never runs twice in one chain.
- No destructive page actions: `DESTRUCTIVE_PAGE_ACTIONS` are refused in a
  rule (status `blocked`); they need a person to confirm.
- Live mounts are skipped in the browser (server territory, Phase 1b).

## Run history and test run

- Each run is recorded: rule id, row id, trigger, start, duration, status,
  the interpreter log (capped at 200 entries). The last 50 runs per rule are
  kept, per database, in the browser that ran them (page databases run only
  there). A shared history arrives with server runs (Phase 1b/2).
- A rule whose last run failed turns the ⚡ toolbar button red.
- "Test on a row…" runs the program in `preview` mode against a chosen row
  and lists the changes without writing them.

## Migration (v1 → v2)

On load, every `view.settings.automations` rule of a database becomes one v2
rule on the database, and the view copies are removed. The migration is pure
and idempotent: a database that already has v2 rules is left as it is.

| v1 | v2 |
|---|---|
| `row_added` | `{ type: 'row_added' }` |
| `row_updated` + `watchColumn` | `{ type: 'property_changed', propertyId: watchColumn }` |
| `row_updated` | `{ type: 'property_changed' }` |
| `row_deleted` | `{ type: 'row_deleted' }` |
| `condition {column, operator, value}` | one `Filter` |
| `set_property {column, value}` | `action set_property {property, value}` |
| `notify {message}` | `action notify {message}` |
| `webhook {url}` | `action webhook {url}` |

## UI

- The ⚡ toolbar button opens the Automations sheet beside the database
  (420 px on the right; full screen below 640 px). The View settings screen
  becomes a link to it.
- List: each rule as one sentence ("When Status changes to Done, if Assignee
  is not empty: set Completed on, notify Assignee"), an on/off switch, and
  the last run's result and time. Empty state: five templates (Stamp the
  finish date, Notify the assignee, Triage new rows, Log deleted rows, and
  Weekly review row in Phase 2).
- Editor: three clauses (When, Only if, Do). Each word is a picker with a
  search. Only if reuses the filter rule editor. Do reuses the button step
  list. Footer: last run, "Test on a row…", Save. Escape asks before
  dropping unsaved changes.

## Notify people (security-sensitive, devil gate)

`POST /api/automations/notify { databaseId, ruleId, pageId, recipients, message }`:

- Session required. Each recipient must share a workspace with the caller;
  other ids are dropped and counted, never notified.
- At most 20 recipients per call and a per-caller rate limit (bridge-guard).
- The message is plain text, capped at 500 characters, stored as the
  notification preview; no HTML.
- Writes `osionos_notifications` rows (type `automation`) through the service
  role, as the comments and feed modules already do.

## Order of work

| Wave | Content | Gate |
|---|---|---|
| A1 | Move the program model + interpreter into the engine; app re-exports; canvas tests unchanged and green | canvas, quality |
| A2 | v2 types, matcher, runner with chain guard, migration; canvas tests for each trigger, from → to, conditions, depth 3, no repeat, blocked destructive | canvas, quality |
| A3 | Sheet: list, sentence editor, templates, drafts, Save; e2e for create → fire → history | e2e, screenshots light/dark × 1440/400 |
| A4 | Run history, red ⚡, test run (preview) | e2e |
| A5 | `notify_people` bridge route + host adapter | devil, bridge tests |
| A6 | Remove the v1 planner, its screen and the view-level storage | canvas, e2e, quality |
| 1b | Live mounts: query-router runs v2 through the same interpreter, as the rule owner | devil, grobase tests |

## What this does not do

- No date or schedule triggers (Phase 2).
- No server runs for page databases: they change only in a browser, so the
  editing tab runs the rule, as today.
- History of page-database runs is per browser until server runs exist.
