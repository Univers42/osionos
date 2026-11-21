// The right-hand hint of a slash-menu row (shortcut, "esc", "Suggested" tag).
// Plain row: --osio-fg-muted. --osio-fg-subtle is 4.56:1 on the dark panel, and the
// panel's 200 ms fade-in (osio-slash-menu-in) takes it to 4.44:1 for axe when it
// samples at ~98% opacity: that, not the pointer, is the flake in #331 (the same
// #9a968b on #33302b, on the only two rows that carry a hint, hovered or not).
// Highlighted row (aria-selected, or hovered for rows that never take it): the fill
// is a 10% foreground mix on which muted is only 3.93:1 in dark, so the hint shows
// --osio-fg-default, the row label's own colour.
// The class string must stay a literal so Tailwind sees it; the contrast is proved
// in tests/canvas/slash-hint-contrast.test.ts.

export const SLASH_HINT_CLASS =
  "text-[var(--osio-fg-muted)] group-hover:text-[var(--osio-fg-default)] group-aria-selected:text-[var(--osio-fg-default)]";
