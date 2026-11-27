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
   or in Settings, not in extra columns of the pane. Settings follows the same rule:
   its section list is part of the Settings console, never the app sidebar.
5. **Unavailable means absent.** Hide an entry with `isAvailable` (missing URL,
   kill-switch) or `requiredRole`; do not show a disabled icon that leads nowhere.
6. **Reuse, don't restyle.** Panels use the existing panel host and row components
   (`SidebarPanel`, `RecentPageRow`, the settings section frame); colours, radii and
   motion come from `--osio-*` tokens (`src/app/styles/README.md`). A new look for one
   feature is a design-system change, made there for everyone.
7. **The top bar is the keyboard way in.** The welcome has no search field of its own;
   every action, setting and question starts in the top bar (`TopBarSearch`). A
   feature adds a command to the palette (`src/widgets/top-bar/model/commands.ts`)
   rather than a shortcut button, and a setting with a short fixed list of values adds
   an entry to `inlineSettings()` (`src/features/settings/model/inlineSettings.ts`) so it
   can change from the bar.

## The top bar's modes

The first character picks the mode; the icon and a chip on the right name it. `?`
lists them.

| Type | Mode | What it reaches | Network |
| --- | --- | --- | --- |
| (nothing) | Search | pages, people, messages | page, people and message search |
| `>` | Commands | every palette command | none |
| `:` | Settings | `:theme dark`, or `:Theme ` then a value | none |
| `/` | Ask Binocle | hands the text to the assistant, unsent | none until you press Send |
| `@` | People | the directory | people search only |
| `#` | Messages | chat messages (only while unified search is on) | message search only |
| `?` | Help | these modes and the Help commands | none |

A setting row marked "Current" changes nothing when chosen. A row the bar cannot
apply (an accent your color scheme sets, a mode your theme pins) says why and opens
the Appearance settings instead.
Matching is by words contained in the name, not fuzzy: "drk" finds nothing.

## The exception

`/machine` (`App.tsx`, `LazyMachineView`) is a standalone window, not a pane: it is
served to a paired computer outside the workspace shell, so it has no rail, no sidebar
and no Settings. Nothing else gets this exception.

## Checking a change

- `tests/canvas/rail-registry.test.ts`: item kinds, unique ids, active state.
- `tests/canvas/palette-modes.test.ts` and `tests/e2e/functional/paletteModes.spec.mjs`:
  the prefixes, the rows, and which modes reach the network.
- A new settings section is two edits: its entry in `sections.ts` (navigation, search
  and deep links read it) and its lazy panel in `src/features/settings/ui/sectionPanels.tsx`.
  If it needs more wiring than that, it is in the wrong place.
- What these rules do not check: a pane that grows its own toolbar of settings. That
  is a review call.
