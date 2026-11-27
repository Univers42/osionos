# Where a feature lives in the shell

Every feature used to grow its own entry points: a footer button, a settings page in
its own pane, a console with its own options. The same thing was reachable three ways
and the sidebar grew with each feature. These rules stop that. A review that adds a
feature checks them.

## The rules

1. **One rail entry per feature.** Add one `RailItem` to `RAIL_GROUPS`
   (`src/widgets/activity-rail/model/railItems.ts`), in the group that says what the
   user does there (Workspace, Workbench, Conversations, Apps). It either selects a
   side panel (`kind: "panel"`) or opens a workspace tab (`kind: "workspaceTab"`). There
   is no third kind, and `tests/canvas/rail-registry.test.ts` fails on one.
2. **No second navigation.** No footer buttons, no header shortcuts, no floating
   launcher for a feature that has a rail entry. The sidebar footer carries only the
   legal links and the invite call-to-action.
3. **Settings live in Settings.** A feature's options, keys, connections and
   consoles are a section of `SETTINGS_SECTIONS` (`src/features/settings/model/sections.ts`,
   group `"features"`), opened with `openSettings(id, anchor?)`. A feature never
   renders its own settings page or modal; it links to its section.
4. **A feature's pane shows the feature.** The pane holds the work itself (the chat,
   the board, the inbox). Configuration, history and side tools go in its side panel
   or in Settings, not in extra columns of the pane.
5. **Unavailable means absent.** Hide an entry with `isAvailable` (missing URL,
   kill-switch) or `requiredRole`; do not show a disabled icon that leads nowhere.
6. **Reuse, don't restyle.** Panels use the existing panel host and row components
   (`SidebarPanel`, `RecentPageRow`, the settings section frame); colours, radii and
   motion come from `--osio-*` tokens (`src/app/styles/README.md`). A new look for one
   feature is a design-system change, made there for everyone.

## The exception

`/machine` (`App.tsx`, `LazyMachineView`) is a standalone window, not a pane: it is
served to a paired computer outside the workspace shell, so it has no rail, no sidebar
and no Settings. Nothing else gets this exception.

## Checking a change

- `tests/canvas/rail-registry.test.ts`: item kinds, unique ids, active state.
- A new settings section is two edits: its entry in `sections.ts` (navigation, search
  and deep links read it) and its lazy panel in `src/features/settings/ui/sectionPanels.tsx`.
  If it needs more wiring than that, it is in the wrong place.
- What these rules do not check: a pane that grows its own toolbar of settings. That
  is a review call.
