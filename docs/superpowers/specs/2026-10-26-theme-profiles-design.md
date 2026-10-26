# Theme profiles and the `>` command palette — design

Status: approved in chat by the owner on 2026-10-26 ("exactly, we need to do all of that",
"yes do all of that", "all of it"). Branch `feat/theme-profiles`, from main a6c8aadac.

## Intent

People want to make osionos their own the way they make VS Code their own:
- a theme is a JSON file they can read, edit, share and keep several of;
- a profile switches their whole setup at once;
- the command palette (`>`) changes anything without opening Settings.

Today the app has nine generated palettes, light/dark, an accent, and three size axes. Nothing
else can be changed, and `>` can only navigate to a Settings page.

## Goals

1. **Theme JSON.** A short document that overrides any of the app's style tokens: colors,
   spacing, sizes, radius, borders, widths, heights and fonts. You write only what you change;
   everything else comes from the base the theme starts from.
2. **Edited in the built-in code editor, VS Code style.**
   - Monaco with a JSON Schema: completion lists every token, hover shows what it changes and
     its current value, and an invalid value gets a red underline.
   - The app restyles live as you type. Save keeps it, Revert drops it.
3. **Profiles.** Named bundles: a theme plus the look-and-feel preferences (mode, palette,
   accent, density, roundness, UI scale, link underlines, motion, animated images, hovercards,
   URL paste).
   - You can switch, create from the current setup, rename, delete, export and import.
   - An exported profile is one self-contained JSON file, with its theme inline.
4. **Entry points.**
   - Settings › Preferences › Theme gets a theme picker, a profile picker and an
     **Advanced (JSON)** button.
   - Every one of those actions is also a `>` command.
5. **`>` as VS Code's command palette.**
   - Every preference is a command. Enter opens a second-step picker of its options with the
     current one checked.
   - **Preferences: Color Theme** previews each theme live while you arrow through the list.
     Enter keeps it; Esc puts back what you had.
   - Recently used commands come first. Every row shows its shortcut.
6. **Five shipped themes** written in the same format: real, readable examples to copy.
7. **Proven.** Unit tests and Playwright e2e run in GitHub Actions; the change is also verified
   live in a real browser before it is called done.

## Non-goals

- Sharing themes with other people, or a theme marketplace. Export/import as a file covers
  hand-to-hand sharing for now.
- Keyboard shortcuts inside profiles. They have their own editor (`features/automations`).
- Arbitrary CSS rules or selectors. A theme sets token values only.
- Loading web fonts from a theme. A font must be installed or already bundled (Inter,
  Newsreader, JetBrains Mono).

## Anti-goals (a failure even if it works)

- A theme that can lock someone out. An unreadable theme must always be escapable.
- A JSON format people won't read: nesting deeper than one group, or keys that differ from the
  token names the browser's devtools show.
- A second list of settings that drifts from the first.
- Slowing the app. Applying a theme or a preview stays within the 20 ms interaction budget.

## The theme format

```json
{
  "name": "Harbor Night",
  "base": "dark",
  "palette": "nord",
  "colors": { "bg-page": "#0f1520", "fg-default": "#dbe4ee", "accent": "#5fb3b3" },
  "layout": { "radius": "10px", "page-max-width": "880px", "topbar-h": "44px" },
  "fonts": { "font-ui": "\"Inter Variable\", system-ui, sans-serif", "font-size-ui": "15px" }
}
```

- **Keys** are the CSS custom property names without `--osio-` (`bg-page` is
  `--osio-bg-page`). They match what devtools shows, so there is no mapping table to learn or
  keep in sync.
- **Groups** are `colors`, `layout` and `fonts`, and nothing deeper.
  - A group limits completion to its kind, which keeps each list short.
  - A key in the wrong group gets a diagnostic that names the right one.
- **`base`** is `light` or `dark`. **`palette`** is any shipped palette id. Together they are
  the starting point. Both are optional: a theme without `base` follows the mode preference,
  and one without `palette` follows the palette preference, so a theme that only changes
  layout or fonts works in light and dark alike.
- **`name`** identifies the theme: 1–48 characters, unique per account (case-insensitive),
  and never a shipped theme's name. The storage key is its slug (`harbor-night`).
- **Shipped themes are read-only.** Opening one in the editor shows it with a banner; Save
  stores a copy named "<name> (copy)" and switches to it.
- **Values** are validated per token kind:
  - `color`: hex, rgb/rgba, hsl/hsla, oklch/oklab, a named color, or `transparent`;
  - `length`: a number with px/rem/em/%/vw/vh, or `calc()` of those;
  - `number`: line height, font weight, a scale;
  - `font`: a comma list of family names;
  - `shadow`: box-shadow syntax;
  - `duration`: ms or s.
  - Rejected everywhere: `url(`, `var(`, `expression(`, `;`, `{`, `}`, `<`, `>`, `\`, `!`,
    `@`, and any value over 160 characters.
  - In the browser a value must also pass `CSS.supports(<property for its kind>, value)`.
- **Token catalog.** `src/shared/config/themeTokens.ts` is the one list of what a theme may set:
  key, kind, group, a one-line description, and the default read from the live stylesheet.
  - It covers every semantic token (`--osio-bg-*`, `fg-*`, `accent*`, `border*`, status
    colors, `link*`), every component token (overlay, control, field, chip, tooltip, menu),
    the syntax, graph and block tints, and the geometry and type tokens: space, radius, control
    and field heights, topbar, statusbar, page and cell widths, focus ring, font families,
    sizes, weights, line heights, letter spacing, shadows and durations.
  - Ramp tokens (`n-*`, `a-*`), z-index, and internal tokens (fades, splitter hit area, pane
    zoom, debug) are excluded by an explicit list.
  - A test fails when a token defined in `src/app/styles/` is neither in the catalog nor on the
    exclusion list, and when a catalog key is no longer defined. A new token cannot appear
    without being classified.

## The profile format

```json
{
  "name": "Writing",
  "theme": "Harbor Night",
  "preferences": { "mode": "dark", "density": "compact", "uiScale": "large", "motion": "reduce" }
}
```

- `theme` is a theme name, a shipped palette id (`"nord"`), or, in an exported file, the whole
  theme object inline. Renaming a theme rewrites the profiles that name it.
- `preferences` takes the keys of `Appearance` (`shared/config/theme.ts`) plus `mode` and
  `palette`. A key that is left out keeps its default.
- When the active theme sets `base`/`palette`, those win over `mode`/`palette`. The Settings
  controls show "set by the theme".

## How it works

- **Apply.**
  1. A theme compiles to a map of `--osio-*` property to value.
  2. Applying it sets `data-theme`/`data-palette` from `base`/`palette`, then sets each changed
     property on `document.documentElement.style` and removes the ones that dropped out.
- **Why CSSOM.** `style.setProperty` cannot inject a rule. Inline style wins over the
  generated `[data-theme][data-palette]` rules without touching them. `<html style>` is already
  in `APPEARANCE_ATTRIBUTES`, so Monaco and the legacy graph re-theme themselves.
- **Scoped tokens.** Tokens defined below root (such as the code card's syntax set and the
  component fades) are reachable only through the root tokens they read. The catalog lists
  only root tokens.
- **The legacy workspace override stays dead.** `WorkspaceConfig.appearance`
  (`shared/config/workspaceConfigStore.ts`) once wrote seven colors inline on `<html>`. It is no
  longer applied and is kept only for round-trips, so nothing competes with the theme for
  `<html style>`. A palette pick still clears it.
- **Pre-paint.**
  - The compiled map of the active theme is cached in localStorage `osionos:theme-vars`.
  - `index.html`'s pre-paint script applies it before first paint. It keeps only keys matching
    `^--osio-[a-z0-9-]{1,48}$` whose value passes the same forbidden-character check, so a
    tampered cache cannot do more than the app itself could.
- **Storage and sync.** Rows of the existing `osionos_user_settings` table. A section name only
  has to match `^[a-z][a-z0-9_-]{0,31}$` and a value must fit 16 KB
  (`models/osionos-account-profiles-migration.sql:216-218`), so no migration is needed. The
  account erasure map already deletes these rows with the account.
  - **One section per theme**, `theme-<slug>` (slug of at most 24 characters), so 24 themes
    never share one 16 KB value. A theme document is capped at 12 KB of JSON.
  - **One `profiles` section** `{ <profileId>: ProfileDoc | null }`. At most 12 profiles of
    about 300 bytes each fit in it easily.
  - **Routes**, in `scripts/bridge-preferences.mjs` next to the other sections:
    - `GET /api/account/themes` lists the caller's `theme-*` rows;
    - `PUT /api/account/themes/<slug>` replaces one;
    - `DELETE /api/account/themes/<slug>` removes it;
    - `/api/account/profiles` is a section like the others (GET, PATCH, PUT).
  - The bridge validates at the trust boundary, with the same caps as the client: at most
    24 themes and 12 profiles; a name of 1–48 characters; at most 200 keys per group; key regex;
    value length; the forbidden characters; a known `base`; a palette id of `[a-z-]{1,32}`.
- **Offline and local state.**
  - Offline (the offline build, or no session), themes and profiles live in localStorage only.
  - The **active** profile is per device (localStorage `osionos:active-profile`), as a VS Code
    profile is per window. The list follows the account.
- **Editor tab.**
  - A new tab kind `theme-json` with two documents: a theme, or the active profile
    ("Settings (JSON)"). It is wired like the settings tab: `TabKind`, a `PaneContent` guard,
    `layoutPersist` restore, and a lazy view.
  - It mounts Monaco through `features/ide/model/monacoRuntime.ts` with
    `monaco-editor/esm/vs/language/json` and its worker loaded **only in this chunk**. The code
    file view keeps its no-language-services posture.
  - The schema is generated from the token catalog and the preference registry.
- **Live preview.**
  - Typing re-parses the document after 120 ms. Every valid value applies; an invalid one gets
    a marker and is skipped.
  - Save writes the document and keeps the preview; Revert restores the saved state.
  - Closing the tab with unsaved changes reverts the preview and keeps the draft (per tab, in
    sessionStorage); reopening the tab brings the draft back with a "Draft restored" note.
    The layout store has no close guard, and keeping the draft loses nothing.
- **Contrast warnings.** After each apply, fixed text pairs are resolved to RGB through
  `getComputedStyle` and checked against WCAG: `fg-default`, `fg-muted` and `link` on
  `bg-page` and `bg-surface`, `accent-fg` on `accent`, `danger-fg` on `danger`. Under 4.5:1
  gives a Monaco warning on the offending key. It warns, never blocks.
- **Escape hatches.**
  - `?theme=safe` skips the custom theme for that visit, at pre-paint and at runtime, with a
    banner offering a reset.
  - **Preferences: Reset Theme** in `>` and a **Reset theme** button in Settings bring back the
    built-in look.
- **Preference registry.** `src/shared/config/preferenceRegistry.ts`, next to `theme.ts` so
  the theme feature and the settings feature can both read it, lists every
  preference once: key, label, options with labels, how to read it, how to write it. The
  profile schema, the `>` preference commands and the profile export all read it.
  `AppearanceControls` takes its option labels from it.
- **Command palette.**
  - `PaletteCommand` gains an optional `pick(): QuickPick`. A quick pick has a title, items
    (label, description, `checked`), `onPreview(item)`, `onAccept(item)` and `onCancel()`.
  - `usePalette` holds the open pick. `TopBarSearch` renders its items: arrow keys preview,
    Enter accepts, Esc cancels (reverts) and returns to the command list.
  - Recently used ids (at most 8) are kept in localStorage `osionos:palette-recent` and listed
    first when the query is exactly `>`.

### Commands

- **Preferences:** Color Theme (pick, live preview), Theme Mode, Color Palette, Accent, Density, Roundness,
  UI Scale, Link Underlines, Motion, Animated Images, Hovercards, Paste URLs. Each is a pick,
  generated from the registry, with its current value checked.
- **Preferences:** Open Theme (JSON), Open Settings (JSON), Reset Theme.
- **Themes:** New Theme from Current, Duplicate Theme, Delete Theme, Export Theme (copies the
  JSON), Import Theme (opens an empty editor to paste into).
- **Profiles:** Switch Profile (pick), New Profile from Current, Rename Profile, Delete Profile,
  Export Profile, Import Profile.
- Delete Theme and Delete Profile act at once and show a toast with **Undo**.
- Every existing Settings navigation command stays.

## Shipped themes

The themes are JSON files in `src/shared/config/themes/`. Each one shows off a different part
of the format, and each is held by a test: valid against the catalog, and AA contrast on every
checked pair, computed from its hex values.

| Theme | Base | What it demonstrates |
|---|---|---|
| Harbor Night | dark | deep slate surfaces, a sea-glass accent |
| Studio Paper | light | cool white paper, graphite text, a teal accent, a serif body |
| Graphite Compact | dark | neutral gray, sharp radius, compact control and field heights, tighter spacing |
| High Contrast | dark | black and white, a thick yellow focus ring, strong borders, larger text |
| Meadow | light | a green-tinted page, round corners, roomier spacing and page width |

## Performance

- **Budget:** a full theme apply, or one preview step, completes within 20 ms p95, measured
  around `apply` plus the next animation frame on the e2e fixture page.
- **Fast path:** only changed properties are written, so an arrow-key step usually writes about
  20 properties, not 200.
- **Load:** the editor chunk and the JSON worker load on first open of the tab. The warm path
  gains only the catalog-free apply module, a few KB.

## Verification

- **Canvas tests** (`node --test`):
  - the validator: every kind, accept and reject cases, and injection attempts
    (`red; } body {`, `url(…)`, `var(--x)`, `\0`);
  - catalog drift against the CSS, and theme compilation;
  - profile export → import round-trip; the shipped themes' validity and contrast;
  - the registry → palette commands → picks; the schema generator.
- **Bridge tests:** the `themes` and `profiles` sections accept good documents and refuse
  oversize, extra-deep and forbidden ones; user A cannot read user B's sections.
- **Playwright e2e**, on the offline build in CI:
  - Advanced (JSON) opens the editor;
  - typing a color restyles `<html>` live (checked with `getComputedStyle`);
  - an invalid value gets a marker and is not applied;
  - Save and reload persists the theme; Revert restores it;
  - `>` Color Theme: arrow keys preview, Esc reverts, Enter keeps;
  - a profile switch applies the theme and the preferences;
  - export, then import, round-trips;
  - `?theme=safe` shows the default look and the banner.
- **Live check:** after deploy, in a real browser on the funnel, each shipped theme is switched,
  one is edited live in the JSON editor, and the `>` previews are used. Screenshots go in the PR.

## Rollout

- Kill switch: flag `osio.themes`, default ON (`shared/config/featureFlags.ts`). With it off,
  the Advanced button, the theme-json tab and the theme/profile commands are absent, and any
  stored theme is not applied.
- Ship in waves, each a green PR merged to main and deployed:
  1. catalog, validator and apply;
  2. editor and Settings entry;
  3. the preference registry, profiles and sync;
  4. palette picks and the preference commands.

## Calls I made (the owner can overrule)

- Keys are token names without the prefix, not VS Code-style dotted names. They match devtools.
- Three groups (`colors`, `layout`, `fonts`) rather than one flat map, for shorter completion
  lists.
- A profile does not carry keyboard shortcuts.
- The active profile is per device; the list of profiles follows the account.
- Low contrast warns and never blocks; `?theme=safe` and Reset are the guarantees.
- The JSON language service loads only inside the theme editor.
- Shipped themes are read-only; saving one makes a copy.
- One settings row per theme, so the 16 KB row limit caps a theme, not the whole collection.

## Left to the builder

- The exact catalog descriptions, and which internal tokens go on the exclusion list (each one
  with a reason).
- The quick-pick visuals, within the existing palette's styles.
- The shipped themes' exact values, within AA.
