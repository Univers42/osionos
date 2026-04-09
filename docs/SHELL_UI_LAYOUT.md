# Shell Layout Spacing — Diagnosis & Fixes (v2)

**Date:** April 9, 2026
**Scope:** Page layout and block spacing in osionos
**Approach:** Fluid CSS with `clamp()`, no hard breakpoints for layout width

---

## The problem

Comparing the Notion screenshot against osionos side by side reveals four issues:

1. **Content too narrow** — the 708px max-width with fixed 96px padding leaves too much dead space on large screens (1854px viewport = 57% wasted)
2. **No fluid scaling** — fixed padding means the layout jumps at breakpoints instead of scaling smoothly across team members' different screens
3. **Blocks are compressed** — 2-4px vertical gaps everywhere where Notion uses 8-28px
4. **Font size too small** — 14px body text with tight line-height compounds the compressed feeling

---

## Part 1 — Fluid content width (Notion's strategy)

Notion doesn't use fixed max-width + fixed padding. It uses proportional padding that scales with the available space, capped at reasonable limits. The content breathes on large screens and tightens gracefully on small ones — no jumps.

### The formula

```
available width = 100% of parent (viewport minus sidebar)
side padding    = clamp(minimum, proportional, maximum)
                = clamp(16px,    11%,           96px)
content width   = capped at 900px, centered
```

### How it behaves across screens

| Viewport | Minus sidebar (275px) | 11% padding each side | Effective content | Feels like |
|----------|----------------------|----------------------|-------------------|------------|
| 1854px   | 1579px               | 96px (capped)        | ~708px (max 900)  | Spacious   |
| 1440px   | 1165px               | 96px (capped)        | ~708px (max 900)  | Comfortable|
| 1280px   | 1005px               | 96px (capped)        | ~813px            | Balanced   |
| 1024px   | 749px                | 82px                 | ~585px            | Compact    |
| 768px    | 493px                | 54px                 | ~385px            | Tight      |
| 480px    | 480px (no sidebar)   | 16px (minimum)       | ~448px            | Mobile     |

One rule, zero breakpoints, works on every screen.

### Implementation

**File:** `src/pages/notion-page/ui/notionPage.css`

Replace the three width/padding blocks for header, properties, and body with:

```css
/* ── Fluid layout (Notion-style) ─────────────────────────────── */

.notion-page-header,
.notion-page-properties,
.notion-page-body {
  max-width: 900px;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding-left: clamp(16px, 11%, 96px);
  padding-right: clamp(16px, 11%, 96px);
}
```

Then update each section's specific vertical values:

```css
.notion-page-header--with-cover {
  margin-top: -42px;
}

.notion-page-header--no-cover {
  padding-top: 80px;
}

.notion-page-body {
  padding-top: 16px;       /* was 4px — gap between title and first block */
  padding-bottom: 120px;   /* unchanged — scroll past end */
  flex: 1;
}
```

Remove the old `@media` rules for padding — `clamp()` replaces all of them. The only media query you still need is for hiding the sidebar on mobile:

```css
@media (max-width: 768px) {
  .notion-page-title {
    font-size: 30px;
  }

  .notion-page-icon {
    width: 54px;
    height: 54px;
    font-size: 54px;
  }

  .notion-page-icon svg {
    width: 54px;
    height: 54px;
  }

  .notion-page-cover {
    min-height: 120px;
    max-height: 180px;
  }
}
```

---

## Part 2 — Block vertical rhythm

These are Tailwind class changes in `src/features/block-editor/ui/BlockEditor.tsx`.

The principle: headings create visual section breaks (large top margin, small bottom margin). Content blocks have consistent small spacing. The rhythm should feel like breathing — expand before a heading, contract between related paragraphs.

### Heading spacing

| Type | Before | After | Top | Bottom |
|------|--------|-------|-----|--------|
| heading_1 | `mt-6 mb-1` | `mt-8 mb-2` | 32px | 8px |
| heading_2 | `mt-5 mb-1` | `mt-7 mb-2` | 28px | 8px |
| heading_3 | `mt-4 mb-0.5` | `mt-6 mb-1.5` | 24px | 6px |
| heading_4 | `mt-3 mb-0.5` | `mt-5 mb-1` | 20px | 4px |
| heading_5 | `mt-2 mb-0.5` | `mt-4 mb-1` | 16px | 4px |
| heading_6 | `mt-2 mb-0.5` | `mt-4 mb-1` | 16px | 4px |

Example — heading_1:

```tsx
// BEFORE
className="text-2xl font-bold text-[var(--color-ink)] mt-6 mb-1 leading-tight"

// AFTER
className="text-2xl font-bold text-[var(--color-ink)] mt-8 mb-2 leading-tight"
```

### Content block spacing

| Type | Before | After | What changes |
|------|--------|-------|-------------|
| paragraph | `py-0.5` | `py-[3px]` | 2px → 3px each side (Notion's exact value) |
| bulleted_list wrapper | `pl-5` | `pl-1.5` | 20px → 6px indent (Notion uses less) |
| numbered_list wrapper | `pl-5` | `pl-1.5` | Same |
| code block wrapper | `my-1` | `my-3` | 4px → 12px vertical margin |
| callout wrapper | `my-0.5` | `my-3` | 2px → 12px vertical margin |
| quote wrapper | `my-0.5` | `my-2` | 2px → 8px vertical margin |
| divider | `py-2` | `py-4` | 8px → 16px vertical padding |

Example — code block:

```tsx
// BEFORE
<div className="my-1 rounded-lg overflow-visible border border-[var(--color-line)] relative">

// AFTER
<div className="my-3 rounded-lg overflow-visible border border-[var(--color-line)] relative">
```

Example — callout:

```tsx
// BEFORE
<div className={`flex items-start gap-3 p-3 rounded-lg border my-0.5 ${colors.bg} ${colors.border}`}>

// AFTER
<div className={`flex items-start gap-3 p-3 rounded-lg border my-3 ${colors.bg} ${colors.border}`}>
```

Example — quote:

```tsx
// BEFORE
<div className="flex my-0.5">

// AFTER
<div className="flex my-2">
```

---

## Part 3 — Font size (optional but recommended)

Notion uses 16px body text. Osionos uses 14px (`text-sm`). This is a style decision, but the smaller size makes the compressed spacing feel worse.

**Option A — Match Notion (16px):**

Change every `text-sm` in paragraph, list items, callout content, and quote content to `text-base`:

```
paragraph:      text-sm → text-base
bulleted_list:  text-sm → text-base
numbered_list:  text-sm → text-base
callout text:   text-sm → text-base
quote text:     text-sm → text-base
```

**Option B — Keep 14px but increase line-height:**

If you prefer the smaller text (Obsidian uses ~15px), increase line-height to compensate:

```
paragraph: leading-relaxed → leading-[1.8]
```

This gives 14px × 1.8 = 25.2px line height, which opens up the text vertically without changing font size.

Either option works. The spacing fixes in Part 2 are effective regardless.

---

## Summary — All changes by file

### `notionPage.css`

| What | Before | After |
|------|--------|-------|
| Header/properties/body max-width | `708px` (or `900px`) | `900px` |
| Header/properties/body padding | `padding: 0 96px` (fixed) | `padding-left: clamp(16px, 11%, 96px); padding-right: clamp(16px, 11%, 96px)` |
| Body padding-top | `4px` | `16px` |
| Media queries for padding | 3 breakpoints (900px, 600px) | Remove — `clamp()` handles it |
| Keep media query for | — | Font size, icon size, cover height (visual, not layout) |

### `BlockEditor.tsx`

| Block type | Before | After |
|-----------|--------|-------|
| heading_1 | `mt-6 mb-1` | `mt-8 mb-2` |
| heading_2 | `mt-5 mb-1` | `mt-7 mb-2` |
| heading_3 | `mt-4 mb-0.5` | `mt-6 mb-1.5` |
| heading_4 | `mt-3 mb-0.5` | `mt-5 mb-1` |
| heading_5 | `mt-2 mb-0.5` | `mt-4 mb-1` |
| heading_6 | `mt-2 mb-0.5` | `mt-4 mb-1` |
| paragraph | `py-0.5` | `py-[3px]` |
| bulleted_list | `pl-5` | `pl-1.5` |
| numbered_list | `pl-5` | `pl-1.5` |
| code block | `my-1` | `my-3` |
| callout | `my-0.5` | `my-3` |
| quote | `my-0.5` | `my-2` |
| divider | `py-2` | `py-4` |

---

## Testing

1. Apply `notionPage.css` changes first → verify content width scales when resizing the browser window (drag edge). No jumps, smooth scaling.
2. Apply `BlockEditor.tsx` heading margins → headings should create clear visual section breaks.
3. Apply code/callout/quote/divider margins → blocks should stop touching each other.
4. (Optional) Apply font size change → text should feel more readable.
5. Test on different viewport widths: 1920px, 1440px, 1280px, 1024px, 768px. Content should feel proportional at every size without any breakpoint jumps.

Ask each team member to verify on their screen after applying. The `clamp()` approach means everyone sees a proportional layout regardless of their monitor size.

# Squeezed blocks problem:

After changing all those values, this problem was persisting. Further examination on a header with DevTools, showed that the margin-top values were 0.
It seemed that the global.css that uses Tailwind v4 cascade layers may overwrite utilities if our reset is not on a layer.

## Solution:

Use Tailwinds reset instead of the one implemented before.

@import "tailwindcss" already includes Preflight (it's own reset), which already does box-sizing_ border-box, and resets compatible margins with its own utilities.
Our manual reset was stepping over this.

This block was eliminated from global.css to solve the problem:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
```

# Work in process:

We're trying to implement a mobile responsive behaviour for our sidebar:

Under ~768px, sidebar should hide and open as an overlay with a hamburger type button.

At the moment, its layout has a fixed wisth defined in App.tsx:

```tsx
<div className="flex h-screen w-screen overflow-hidden">
  <NotionSidebar />           {/* fixed width, always visible */}
  <main className="flex-1">
    <MainContent />
  </main>
</div>
```
