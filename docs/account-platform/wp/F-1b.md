# F-1b — workspace members show the name the bridge sends, everywhere

**Repo/branch:** app = `/home/dlesieur/Documents/groot-wt/integration/app` on `feat/account-platform` (worker branch `feat/acct-F-1b`). Not 👹: client display only, no route, no SQL. Follow-up of the F-1 LEDGER row ("Open F-1b"). Facts from a fresh read 2026-10-24; re-check each anchor.

## Why (verified anchors)

1. The bridge roster already names every member: `GET /api/workspaces/:id/members` answers `{ ok, members: [{ userId, name, avatar, role }] }` with `name` from the identity summary, `'Member'` when there is none (`scripts/bridge-collab.mjs:208-221`).
2. The client drops it: `workspaceMembersFromWire` (`src/store/settings/workspaceMembersWire.ts:37-48`) keeps `userId`, dates and role only, and `WorkspaceMember` (`src/store/settings/types.ts:117-127`) has no `name`.
3. So every reader falls back to the id for anyone who is not one of the signed-in user's own personas:
   - People → Members: `buildMembersState` (`src/features/settings/people/membersSource.ts:46-57`) titles each row `persona?.name ?? member.userId`; its header comment (`:16`) says "the member row has no name".
   - Teams: `labelFor` (`src/features/settings/teamspaces/TeamsSection.tsx:28-32`) prefers a wire name, but the workspace-member picker (`:61`) and the name sent on add (`:63`) call it without one.
4. `TeamsSection` reads `useWorkspaceMembersStore` (`:38`) but never hydrates it, so the picker is empty until another panel (People, `PeoplePanel.tsx:43`) or the presence bar (`SharedSpacePresenceBar.tsx:69`) has loaded the roster.

Seen with two real accounts in one workspace (dev.pro.photo and dylan@gmail.com): each sees the other as a UUID.

## Contract

- `WorkspaceMember` gains `name?: string` (optional; local and legacy rows have none). No `avatar` field (nothing renders a member avatar today; YAGNI).
- `workspaceMembersFromWire` keeps `row.name` when it is a non-empty string, trimmed, at most 120 characters (cut, not dropped); anything else leaves `name` unset. `workspaceMemberFromWire` inherits it. `sanitizePersistedMembers` keeps a persisted string `name` and drops a non-string one (the row stays).
- **One label rule, one home.** Move `labelFor` out of `TeamsSection.tsx` into a new `src/features/settings/people/memberLabel.ts` exporting `memberLabel(userId, names: Map<string, string>, wireName?: string): string`, with F-1's order unchanged: a wire name that is non-empty and not the id, else the persona name, else the id. `TeamsSection` (roster rows, picker options, the `name` passed to `addTeamMember`) and `buildMembersState` both call it. For the picker and the add call, pass the workspace member's `name`. `buildMembersState` builds the `names` map from `ctx.personas` the way `TeamsSection.tsx:43` does; the row icon stays `persona?.emoji`. Update the `membersSource.ts:16` comment to match.
- `TeamsSection`'s `TeamMembers` (or `TeamsSection` itself, once per workspace) hydrates the roster on mount with `useWorkspaceMembersStore.getState().hydrate(workspaceId, activeUserId)`, the call `SharedSpacePresenceBar.tsx:69` makes, through `runAsync`. Reuse the store's own in-flight handling; do not add a cache.
- The `'Member'` placeholder is the server's answer and is shown as is (better than an id); the bridge is not changed.

## OWNS

- `src/store/settings/types.ts` (the `WorkspaceMember` interface only), `src/store/settings/workspaceMembersWire.ts`
- `src/features/settings/people/memberLabel.ts` (new; 42-school header), `src/features/settings/people/membersSource.ts`, `src/features/settings/teamspaces/TeamsSection.tsx`
- `tests/canvas/workspace-members-wire.test.ts` (extend), `tests/canvas/member-label.test.ts` (new)
- `tests/e2e/functional/workspaceTeams.spec.mjs` (extend only if its existing stub can serve a roster with a name; else report it)

## MUST NOT TOUCH

Any `scripts/` file; `src/shared/notion-database-sys/**`, `packages/**`; `useWorkspaceMembersStore.ts` (unless the hydrate call cannot be made without it: stop and report); `PeoplePanel.tsx`; `SharedSpacePresenceBar.tsx`; other interfaces in `types.ts` (F-3 edits `AccountSettings` in the same file at the same time).

## Tests to add

- W1 (wire test) a bridge body `{ ok, members: [{ userId:'u1', name:' Ada ', role:'editor' }, { userId:'u2', name:'', role:'viewer' }, { userId:'u3', name: 42 }] }` gives `name` `'Ada'`, unset, unset; a 300-character name is cut to 120.
- W2 `sanitizePersistedMembers` keeps a string `name` and removes a numeric one without dropping the row.
- L1 (`member-label.test.ts`) the table: wire name wins over persona; wire name equal to the id falls to the persona; empty wire name falls to the persona; no persona gives the id.
- M1 `buildMembersState` with a member that has a wire `name` and no persona titles the row with that name, not the id (stub the store state; extend an existing People test helper if one exists, else in `member-label.test.ts`).
- E2E, only if the stub allows it: the Teams picker lists a workspace member by name.

## Mutants (after the commit; `memory/commit-before-mutant.md`)

| # | Mutant | Must fail |
|---|---|---|
| 1 | the wire mapper drops `name` again | W1, M1 |
| 2 | `memberLabel` puts the persona or the id first | L1 |
| 3 | `buildMembersState` ignores the wire name | M1 |
| 4 | the 120-character cut removed | W1 |

## Gates

Canvas suite, `test:quality` (0 warnings), `workspaceTeams.spec.mjs` with `PW_BROWSER_SOURCE=system`. No bridge files change, so no bridge run.

## Commit message

`fix(settings): workspace members show the name the bridge sends, in People and Teams`
