# osionos style system

Use design tokens for component styling. Do not hardcode colors in component code; use CSS variables or Tailwind classes backed by tokens.

## Color tokens

All theme color values live in [global.css](global.css). Light and dark mode continue to switch with `data-theme="light"` or `data-theme="dark"` on `<html>`.

Use these semantic tokens:

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
- `--osio-accent`: links, active states, and primary actions.
- `--osio-accent-hover`: hovered primary actions.
- `--osio-accent-fg`: text/icons on accent fills.
- `--osio-danger`: destructive text and destructive action fills.
- `--osio-danger-hover`: destructive hover states.
- `--osio-danger-fg`: text/icons on danger fills.
- `--osio-overlay`: modal/page scrim. This is the only token allowed to use `rgba()`.

Legacy `--color-*` aliases remain during migration, but new component code should use `--osio-*` tokens only.

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

Use Tailwind `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, and `text-3xl`. Tailwind v4 reads those utilities from the `--osio-font-size-*` tokens through the `@theme` block in [global.css](global.css).

Avoid hardcoded values like `text-[11px]` unless there is a documented product exception.

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

## Rules

1. No hardcoded colors in component code. Use tokens only.
2. Do not add alpha-channel hex values. Use 6-character hex for color tokens.
3. Use `rgba()` only in `--osio-overlay`.
4. Prefer semantic tokens over visual names.
5. Keep legacy `--color-*` aliases only until the migration sweep is complete.