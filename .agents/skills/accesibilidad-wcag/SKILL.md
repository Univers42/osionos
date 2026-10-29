---
name: accesibilidad-wcag
description: >-
  Front-end accessibility auditor and implementer for WCAG 2.2 Level AA and WCAG 3.0 draft guidelines in Osionos. Triggers on: "accessibility", "wcag", "a11y", "contrast", "focus trap", "target size", or "/a11y".
---

# Universal Accessibility (WCAG 2.2 AA / WCAG 3.0) — Osionos Workspace

## Purpose
Ensure all React 19 components, Radix UI primitives, collaborative editors (`EditableContent`), menus, and canvas views across Osionos strictly adhere to **WCAG 2.2 Level AA** standards and emerging WCAG 3.0 draft guidelines, respecting the design token contracts (`scripts/tokens/`), feature-sliced boundaries, and keyboard-first workspace ergonomics while maintaining token economy.

---

## 1. Non-Negotiable WCAG 2.2 AA Criteria (Interactive Workspace)

1. **Target Size (Minimum) [SC 2.5.8 - Level AA]:**
   - Every interactive control (block handles, slash menu items, toolbar icons, dropdown options, tabs) must provide a touch target area of at least **24x24 px** on desktop and **44x44 px** on touch viewports.
   - Use CSS `min-height`/`min-width` or invisible hit-test padding wrappers around small icon buttons.

2. **Focus Not Obscured [SC 2.4.11 & 2.4.12 - Level AA]:**
   - When any block, input, or control receives keyboard focus (`:focus-visible`), it must never be fully or partially obscured by sticky topbars, floating selection toolbars, or dock rails.
   - Enforce visible focus indicators with adequate contrast against theme backgrounds.

3. **Dragging Movements [SC 2.5.7 - Level AA]:**
   - In block reorganization, kanban boards, or canvas panning operated via drag-and-drop:
     - Provide a single-pointer and keyboard alternative (e.g., keyboard shortcut like `Alt+ArrowUp`/`Alt+ArrowDown` to move blocks, or dedicated "Move Up/Move Down" menu actions).

4. **Color Contrast & Token Discipline [SC 1.4.3 & 1.4.11 - Level AA]:**
   - Normal text: minimum contrast ratio of **4.5:1** against the surface background.
   - Large text and essential UI components (borders of inputs, active state indicators): minimum ratio of **3:1**.
   - Use centralized design tokens from `scripts/tokens/`; never hardcode raw hex values. Verify token contracts via `npm run test:quality`.

5. **Semantic HTML & Radix UI ARIA Patterns:**
   - Prefer native HTML5 elements (`<button>`, `<dialog>`, `<nav>`, `<aside>`, `<main>`) and Radix UI accessible primitives (`@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@radix-ui/react-dialog`).
   - ContentEditable blocks (`EditableContent.tsx`): Ensure proper `role`, `aria-multiline`, and screen-reader announcements when block types change (headings, callouts, code blocks).
   - Dynamic popups (slash command menu `/`, mention menus `@`): Provide `aria-expanded`, `aria-activedescendant`, and keyboard arrow navigation (`ArrowUp`/`ArrowDown`/`Escape`/`Enter`).

6. **Keyboard Navigation & Dialog Traps:**
   - Modal dialogs and popovers must trap focus while open.
   - Pressing `Escape` must dismiss any open menu/modal and return focus to the triggering element.
   - Block editor must allow seamless navigation with keyboard arrows without getting trapped in non-editable widgets.

7. **Reduced Motion:**
   - Honor `@media (prefers-reduced-motion: reduce)` by disabling non-essential layout transitions, smooth scrolling, and animated loaders.

---

## 2. Verification Protocol & Docker Tooling

In Osionos, run checks via Docker shims:

1. **Quality & Token Contracts Gate:**
   ```bash
   npm run test:quality
   ```
2. **Typecheck & ESLint:**
   ```bash
   npm run typecheck
   npm run lint
   ```
3. **Playwright E2E & Smoke Verification:**
   ```bash
   npm run test:e2e:smoke
   ```
4. **Lighthouse / Accessibility Audit:**
   ```bash
   npm run lighthouse
   ```

---

## 3. Targeted W3C Reference Protocol (Token Efficient)

When implementing or auditing complex custom widgets (e.g., custom collaborative canvas, multi-level treeview, command palette):
- Query specific W3C WAI-ARIA Authoring Practices using web search (e.g., `w3c wai aria authoring practices combobox`).
- Extract only state models, keyboard interaction table, and ARIA roles. Avoid ingesting full specifications.
