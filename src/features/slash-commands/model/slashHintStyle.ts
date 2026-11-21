// The right-hand hint of a slash-menu row (shortcut, "esc", "Suggested" tag).
// --osio-fg-subtle clears AA on the plain panel but not on the highlighted row, whose
// fill is a 10% foreground mix (#331), so the highlighted row (aria-selected, or
// hovered for rows that never take it) shows --osio-fg-default, the row label's own
// colour. --osio-fg-muted was the issue's first option but is 3.93:1 there in dark.
// The class string must stay a literal so Tailwind sees it; the contrast is proved
// in tests/canvas/slash-hint-contrast.test.ts.

export const SLASH_HINT_CLASS =
  "text-[var(--osio-fg-subtle)] group-hover:text-[var(--osio-fg-default)] group-aria-selected:text-[var(--osio-fg-default)]";
