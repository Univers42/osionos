# osionos style system

Components style themselves with design tokens. Colour values are generated from seeds; everything else (geometry, type, motion) is written by hand in the stylesheets below.

## What each stylesheet owns

[global.css](global.css) imports the others in this order:

| File | Owns | Does not own |
| --- | --- | --- |
| `tokens.generated.css` | every colour that differs by palette or mode, for all nine palettes | geometry, type, motion; edit the seeds, not this file |
| [shell.css](shell.css) | the floating-card frame: `--osio-frame-gap`, `--osio-radius-pane`, pane border/shadow/outline, and the zen, compact and phone overrides | colours |
| [type.css](type.css) | `osio-h1` .. `osio-h4`, the one heading look shared by the editor, the read-only renderer and toggle summaries | margins; the editor's block wrapper owns spacing |
| [recipes.css](recipes.css) | the component tokens and the `osio-surface-overlay`, `osio-surface-panel`, `osio-control`, `osio-chip`, `osio-field` and `osio-menu-*` utilities | colours of its own; it aliases semantic tokens |
| [appearance.css](appearance.css) | the personal axes (density, corners, text size) and the custom accent hue, plus `accents.generated.css` | the palettes |
| `global.css` itself | what no palette changes: spacing, type scale, motion, elevation shape, z-index, the Tailwind `@theme` and the stock-key mapping, legacy `--color-*` aliases | colour values |
| `database-bridge.generated.css`, [database-overrides.css](database-overrides.css) | the vendored database's colours as references to app tokens, and its stock shadow and radius classes | anything outside `.notion-object-database` |

The database pair is not imported by `global.css`. `DatabaseBlock.tsx`, `WorkspaceDatabaseBlock.tsx` and `PeopleDatabasePanel.tsx` import it, so it ships in the lazy database chunk. A component that renders `ObjectDatabase` and does not import it renders the vendored stock colours; `tests/canvas/tokens-bridge.test.ts` fails when a file containing `<ObjectDatabase` is missing from that list.

## Color tokens

There are three tiers. A component reads the semantic or the component tier, never the ramp.

| Tier | Names | Defined in |
| --- | --- | --- |
| Ramp | `--osio-n-0` .. `--osio-n-12` (neutral slots), `--osio-a-solid/-hover/-fg/-text/-subtle` (accent), status, block tints, syntax | `tokens.generated.css`, one block per palette and mode |
| Semantic | `--osio-bg-*`, `--osio-fg-*`, `--osio-border-*`, `--osio-accent*`, `--osio-danger*`, ... | `tokens.generated.css`, once, as aliases of the ramp (`scripts/tokens/aliases.mjs`) |
| Component | `--osio-overlay-*`, `--osio-control-*`, `--osio-field-*`, `--osio-chip-*`, `--osio-tooltip-*` | [recipes.css](recipes.css), as aliases of the semantic tier |

Semantic tokens:

- `--osio-bg-canvas`: the tinted ground the cards float on.
- `--osio-bg-page`: app/page background.
- `--osio-bg-surface`: default cards, menus, and panels.
- `--osio-bg-subtle`: sidebar, secondary panels, and low-emphasis rows.
- `--osio-bg-muted`: selected rows, code chips, and inline mention backgrounds.
- `--osio-bg-elevated`: popovers, floating controls, and modals.
- `--osio-bg-hover`: hover states for clickable rows and icon buttons.
- `--osio-fg-default`: primary readable text.
- `--osio-fg-muted`: secondary text, descriptions, and metadata.
- `--osio-fg-subtle`: placeholders and low-emphasis labels.
- `--osio-fg-strong`: headings and high-emphasis labels.
- `--osio-fg-inverse`: foreground on dark or accent fills.
- `--osio-border-default`: standard borders and dividers.
- `--osio-border-strong`: focus outlines and high-emphasis borders.
- `--osio-accent`, `--osio-accent-hover`, `--osio-accent-fg`, `--osio-accent-text`, `--osio-accent-subtle`: links, active states, primary actions, and the text and tint that go with them.
- `--osio-danger`, `--osio-danger-hover`, `--osio-danger-fg`: destructive text and fills.
- `--osio-overlay`: modal/page scrim.

Never rename an existing `--osio-*` token: more than 3,000 component reads depend on the names. Legacy `--color-*` aliases remain for the vendored code; new component code uses `--osio-*` only.

### Add a palette

A palette is a seed plus optional pins in [scripts/tokens/palettes.mjs](../../../scripts/tokens/palettes.mjs). This is the real entry for Ember, which has no pins:

```js
  {
    id: "ember",
    label: "Ember",
    description: "Cream paper and terracotta — the original editorial look.",
    signatureMode: "light",
    neutral: { hue: 88, chroma: 0.012 },
    accent: { hue: 39, chroma: 0.125 },
  },
```

1. Append an entry. `id` is stored in each user's browser and never changes afterwards; only `label` can. `neutral` tints the greys, `accent` sets the accent. Add `contrast: "AAA"` to hold the palette to 7:1 on body text and on text placed on the accent.
2. To pin canonical colours (Nord's Polar Night, Solarized's base tones), create `scripts/tokens/pins/<id>.mjs` exporting `{ light: {...}, dark: {...} }` keyed by token name, and set `pins:` on the entry. A pin replaces a generated value before anything is derived from it, so a pinned accent also decides the text colour placed on it.
3. Run `npm run tokens`. It writes `tokens.generated.css`, `accents.generated.css`, `database-bridge.generated.css`, `palettes.generated.ts` and `accents.generated.ts`. Commit the result with the seeds.
4. Add the id to the expected lists in `tests/canvas/tokens-palettes-output.test.ts`. That test pins the palette order on purpose.

`node scripts/build-tokens.mjs --check` (a step of `npm run test:quality`) fails when:

- a committed generated file is not what the seeds produce;
- a text/background pair in `scripts/tokens/contrast.mjs` is under 4.5:1 (7:1 for the AAA pairs), in either mode;
- a token is not `#RRGGBB`, a comma-separated `rgba()`, or a `--osio-shadow-rgb` channel triple (`validity.mjs`);
- an accent preset, or any whole-degree custom hue, is unreadable on a palette (`accents.mjs`);
- the vendored database theme declares a colour the bridge table does not map.

It does not check that a palette looks good, that pins are the colours you meant, or that a pair outside the contrast list is readable (see the guards below).

### Add an accent preset

An accent preset replaces the five accent tones (`--osio-a-*`) on top of any palette; surfaces stay. Append a seed to `ACCENT_PRESETS` in [scripts/tokens/accents.mjs](../../../scripts/tokens/accents.mjs):

```js
  { id: "teal", label: "Teal", hue: 195, chroma: 0.09 },
```

Then run `npm run tokens` and update the id list in `tests/canvas/tokens-accents.test.ts`. The generated block selector is `:root[data-accent="<id>"][data-theme="<mode>"]`, which beats a palette's `[data-palette][data-theme]` whatever the load order. Palettes with `contrast: "AAA"` keep their own accent: the selectors exclude them, because no preset tone reaches 7:1 white-on-accent at a lightness that still reads as a colour. `cobalt` is the default, writes no block, and costs nothing when stored.

## Component tokens and recipes

[recipes.css](recipes.css) gives each kind of surface one set of knobs. The kit (`@osionos/ui`) reads the same names, which is why each is also declared in `packages/osionos-ui/tokens.css`.

| Surface | Tokens | Default |
| --- | --- | --- |
| Floating: menu, popover, dropdown list, dialog | `--osio-overlay-bg`, `-border`, `-radius`, `-shadow`, `-padding` | elevated bg, default border, `--osio-radius-overlay`, `--osio-e3`, 4px |
| Button, icon button | `--osio-control-radius`, `-bg-hover`, `-border` | `--osio-radius-control` |
| Text, date, select field | `--osio-field-bg`, `-border`, `-border-focus`, `-radius`, `-h` | surface bg, strong border, accent focus |
| Option and tag chip | `--osio-chip-radius`, `-h`, `-px` | pill, 22px, 8px |
| Tooltip | `--osio-tooltip-bg`, `-fg`, `-radius` | strong fg on surface |
| Menu rows | `--osio-menu-item-hover-bg`, `--osio-menu-separator` | 10% foreground mix, strong border |

The utilities are for host markup that is not a kit component:

From `src/features/block-editor/ui/CalloutTypePicker.tsx`:

```tsx
<div
  role="menu"
  aria-label="Callout type"
  className="absolute left-0 top-full z-50 mt-1 w-52 osio-surface-overlay"
>
  <div className="osio-menu-separator" />
  <button
    type="button"
    role="menuitem"
    onClick={() => setCustomOpen(true)}
    className="osio-menu-item"
    data-tone="muted"
  >
    <Smile size={16} />
    <span>Custom emoji…</span>
  </button>
</div>
```

Put `osio-surface-overlay` on an element and remove its old `bg-*`, `border`, `rounded-*`, `shadow-*` and padding classes. Tailwind settles two utilities for the same property by stylesheet order, not class order, and the kit's `cx` has no tailwind-merge. That is also why the menu colour variants are a `data-tone` attribute and not a second colour class. The recipes carry no colour of their own and do not replace the global `:focus-visible` rule, which beats every utility.

## Appearance attributes

`src/shared/config/theme.ts` writes these on `<html>`; `index.html` mirrors them before first paint so there is no flash.

| Attribute | Values | Stored under | Effect |
| --- | --- | --- | --- |
| `data-theme` | `light`, `dark` | `osionos:theme-mode` | picks the mode inside a palette; a subtree may set its own |
| `data-palette` | a palette id | `osionos:palette` | the nine palettes |
| `data-accent` | a preset id or `custom` | `osionos:appearance` | `accents.generated.css` |
| `data-density` | `compact` | `osionos:appearance` | 32/28/24px controls; `shell.css` takes the frame gap and pane radius to 0 |
| `data-radius` | `sharp`, `round` | `osionos:appearance` | `--osio-radius-scale` 0.5 / 1.33 |
| `data-ui-scale` | `small`, `large` | `osionos:appearance` | `--osio-font-size-ui` 13px / 15px |

A value at its default has no attribute. The custom accent also sets an inline `--osio-accent-hue` on `<html>`.

## Spacing scale

The spacing scale is a 4px grid from `--osio-space-1` through `--osio-space-12`.

| Token | Value | Use |
| --- | ---: | --- |
| `--osio-space-1` | 4px | tight icon/text gaps |
| `--osio-space-2` | 8px | row gap and vertical button padding |
| `--osio-space-3` | 12px | horizontal button padding |
| `--osio-space-4` | 16px | sidebar indent per tree depth |
| `--osio-space-5` | 20px | compact card padding |
| `--osio-space-6` | 24px | section gap |
| `--osio-space-7` | 28px | large inline controls |
| `--osio-space-8` | 32px | card group gap |
| `--osio-space-9` | 36px | dense page inset |
| `--osio-space-10` | 40px | page/header gap |
| `--osio-space-11` | 44px | large touch target |
| `--osio-space-12` | 48px | page section padding |

Defaults:

- Row gap: `--osio-space-2`
- Section gap: `--osio-space-6`
- Button padding: `--osio-space-2` vertical and `--osio-space-3` horizontal
- Sidebar indent: `--osio-space-4` per tree depth

## Typography scale

Use Tailwind `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, and `text-3xl`. They read the `--osio-font-size-*` tokens through the stock-key mapping in the unlayered `:root` block of [global.css](global.css).

| Utility | Token | Value | Use |
| --- | --- | ---: | --- |
| `text-xs` | `--osio-font-size-xs` | 12px | secondary labels, captions, tab labels |
| `text-sm` | `--osio-font-size-sm` | 14px | primary UI text |
| `text-base` | `--osio-font-size-base` | 14px | `body` default, sidebar nav rows |
| `text-lg` | `--osio-font-size-lg` | 16px | small headings |
| `text-xl` | `--osio-font-size-xl` | 20px | |
| `text-2xl` | `--osio-font-size-2xl` | 24px | |
| `text-3xl` | `--osio-font-size-3xl` | 30px | |

That mapping (`--text-*`, `--spacing`, `--radius-*`, `--font-*`) is not in `@theme`. The vendored `notion-database-sys` stylesheet imports Tailwind itself, and its stock `@layer theme` loads later and wins inside the layer; unlayered declarations beat every layer. Add a stock-key override to that `:root` block, not to `@theme`.

The UI font size is set on `body`, never on `html`: a font size on the root element redefines `1rem` for the whole app and the vendored views.

### Reading scale

Inside a document (`.osionos-page-body`) the same utilities resolve one step larger, set in [notionPage.css](../../pages/notion-page/ui/notionPage.css):

| Block | Utility | In the chrome | In a document |
| --- | --- | ---: | ---: |
| paragraph, lists, quote, callout, heading 5 | `text-sm` | 14px | 16px |
| heading 4 | `text-base` | 14px | 18px |
| heading 3 | `text-lg` | 16px | 20px |
| heading 2 | `text-xl` | 20px | 24px |
| heading 1 | `text-2xl` | 24px | 30px |

The page's "Small text" setting switches the step-up off. Embedded databases, code blocks, graph and draw blocks, layout cells and inline menus keep the chrome scale.

It does not reach the read-only renderers that mount outside `.osionos-page-body` — the public page, profile, marketplace preview and hover preview stay on the chrome scale.

The stock scale has no 10, 11 or 40 px step, so three more keys exist: `text-3xs` (`--osio-font-size-3xs`, 10px), `text-2xs` (11px) and `text-display` (`--osio-font-size-display`, 40px). Do not write `text-[11px]`: ESLint rejects it.

## Z-index scale

Use the z-index scale instead of raw numbers:

| Token | Value | Use |
| --- | ---: | --- |
| `--osio-z-base` | 0 | normal stacking context |
| `--osio-z-raised` | 10 | row affordances and inline overlays |
| `--osio-z-sticky` | 20 | sticky table headers and sticky bars |
| `--osio-z-sidebar` | 30 | sidebar and resize handles |
| `--osio-z-popover` | 40 | dropdowns, menus, and popovers |
| `--osio-z-modal` | 50 | modals and scrims |
| `--osio-z-toast` | 60 | toasts and global notifications |
| `--osio-z-max` | 100 | temporary escape hatch only |

In Tailwind, prefer arbitrary token values such as `z-[var(--osio-z-popover)]` over raw values such as `z-50`.

## Radius, elevation and motion in classes

Class names that read tokens (the stock keys are mapped in the unlayered `:root` of [global.css](global.css)):

| Need | Class | Token |
| --- | --- | --- |
| Corners | `rounded-xs`, `rounded-sm`, `rounded-md`, `rounded-lg` | `--osio-radius-xs/-sm`, `--osio-radius`, `--osio-radius-lg`; `rounded-xl` is `-lg`, `rounded-2xl` and `-3xl` are `--osio-radius-card` |
| Elevation | `shadow-osio-e1` .. `shadow-osio-e5` | `--osio-e1` .. `--osio-e5` |
| Transitions | `transition`, `duration-*` | `--osio-dur-fast` and `--osio-ease-standard` by default |

Every radius is multiplied by `--osio-radius-scale`, so `data-radius` restyles all of them at once.

## Guards

Each guard is a text match. Each section below says what it misses, because an approximation presented as a fact gets trusted past the point where it is true. The same limits are written as `Ponytail:` comments in the files.

| Guard | Runs as | Catches | Does NOT catch |
| --- | --- | --- | --- |
| `scripts/check-style-tokens.sh` | last step of `test:quality` | a raw colour literal (`#hex`, `rgb()`, `hsl()`, `oklch()` and the other colour functions, `color(srgb ...)`) in app CSS/SCSS outside `src/app/styles/**` and the vendored database | named colours (`red`, `white`); a colour function whose first channel is on the next line. It flags an id selector made only of hex digits (`#fade`): rename it. It does not read TS/TSX |
| `eslint.config.js` style rules | `eslint --max-warnings=0` | in `src/**` and the kit: `text-[Npx]`, `shadow`/`shadow-sm..2xl`, bare `rounded`, raw hex outside `HEX_ALLOWLIST`, ramp tokens (`--osio-n-*`, `--osio-a-*`) | a class built by concatenation or from a variable; a non-colour string such as `"#abc"` is flagged; prose holding the lowercase word `shadow` is flagged. A string in a TS literal type is skipped. The escape hatch is `HEX_ALLOWLIST` (each entry carries its reason) or an `eslint-disable` with an issue link |
| `scripts/check-token-refs.mjs` | `test:quality` | a `var(--osio-x)` without a fallback that no stylesheet or script defines | a token defined only inside a scope that does not contain its reader; a name built at runtime (`--osio-tint-${hue}`); a `//` inside a string on a line that starts with code |
| `scripts/check-ui-token-contract.sh` | `test:quality` | a token in `packages/osionos-ui/tokens.css` that `global.css`, `tokens.generated.css` and `recipes.css` do not define | a value that differs from the kit's reference value; a token defined only in `shell.css` or `appearance.css` (those files are not read, so it fails as missing); a declaration that does not start its line |
| `packages/osionos-ui/scripts/check-token-contract.mjs` | kit `make check` | a token the kit reads and `tokens.css` does not declare, and a declared token nothing reads | a name built at runtime; a name in a comment counts as a read, which hides an unused declaration |
| `node scripts/build-tokens.mjs --check` | `test:quality` | stale generated files, contrast failures, malformed colours, unmapped vendored colours | a pair of text and background that is not in the hand-kept list in `contrast.mjs` (muted text on a tinted block, until added); borders (hairlines at about 1.3:1 are decoration); a valid pin that is not the colour you meant; the gamut of a seed (a tone outside sRGB loses chroma silently, so a very saturated seed comes out duller than written) |
| `database-bridge.generated.css` | `--check` | a vendored colour variable the table does not map | a role has one mapping for both modes where the vendored theme tunes alpha per mode; vendored hues with no counterpart are folded into the nearest family (cyan and indigo into blue, amber into yellow, teal into green, rose into red), so two vendored hues can render the same; literal colours in vendored markup or stock Tailwind classes stay as they are |

Two more limits that belong in this list:

- `database-overrides.css` points stock Tailwind shadow and radius classes at the elevation and radius tokens. Menus the vendored code portals into `<body>` sit outside `.notion-object-database` and keep their stock shadow. Delete the file once the vendored code reads `--osio-e*`.
- A custom accent hue is proved against every palette for all 360 whole degrees under two models of the browser's gamut clipping (per-channel clip and chroma reduction). An engine that maps the gamut a third way is not covered.

## Ratchet counts

These are measured, not gated: no step of `test:quality` fails when they rise. They are recorded so a later change can say whether it moved them. Measured on 2026-10-14 at `bb442d49` (branch `dev/style`).

| Count | Value | Command |
| --- | --- | --- |
| Raw `<button` elements in `src/` | 504 | `grep -rhoE "<button\b" src --include=*.tsx --exclude-dir=notion-database-sys \| wc -l` |
| `title=` attributes in `src/` | 399 | `grep -rhoE "\btitle=" src --include=*.tsx --exclude-dir=notion-database-sys \| wc -l` |
| `<Button` and `<IconButton` uses, for scale | 177 | `grep -rhoE "<Button\b\|<IconButton\b" src --include=*.tsx --exclude-dir=notion-database-sys \| wc -l` |

What each number gets wrong:

- The raw-button count includes a `<button` inside a comment or a string. It counts opening tags, so a button split over lines counts once, and it does not say how many of them the kit `Button` or `IconButton` could replace.
- `title=` counts every `title=` in a `.tsx` file, which includes component props such as `<Modal title=...>` and is not limited to the DOM attribute that shows a native tooltip. It overstates the native-tooltip count; the kit `Tooltip` replaces only the DOM attribute.
- All three exclude only `src/shared/notion-database-sys` and read `.tsx` only (`src/` holds no `.jsx` outside the vendored tree today). The kit row counts any component named `Button`, including a local copy, not only the kit's.

## Rules

1. Colour values live in the generated files and in `scripts/tokens/`. Component and hand-written CSS code reference `var(--osio-*)` semantic or component tokens.
2. Prefer semantic tokens over visual names, and a component token over a semantic one where the surface has a recipe.
3. Use the z-index scale, the radius and elevation classes, and the type scale above; the ESLint rules reject the stock and literal forms.
4. Add a token to the kit's `tokens.css` in the same change that makes a kit component read it, and define it in the host stylesheets.
5. Keep legacy `--color-*` aliases only until the migration sweep is complete.
