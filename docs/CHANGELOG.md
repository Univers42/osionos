# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Discriminated Union StoredIcon Schema & Legacy Dual-Read Adapter**: Added `StoredIcon` discriminated union type (`emoji`, `icon`, `image`) with `isStoredIcon`, `parseStoredIcon`, `storedIconToCanonical`, and `serializeStoredIcon` in `@osionos/ui`, Zod validation schemas (`storedIconSchema`, `lenientStoredIconSchema`) in `src/shared/icon/storedIconSchema.ts`, and updated `IconValueView` and page models for backward-compatible dual-read support for issue #247.
- **Semantic Option Color Normalizer & Token Resolver**: Implemented `src/shared/colors/semanticColor.ts` pure primitive normalizing legacy Tailwind class strings (Notion DB `TAG_COLORS` and status groups) and arbitrary color strings into canonical `SemanticColor` tokens, with `semanticColorToTokens` binding canonical colors directly to design system CSS tokens (`--osio-block-tint-*`) for issue #247.
- **WCAG 2.2 AA Audit Coverage**: Extended the existing Playwright functional accessibility suite (`tests/e2e/functional/a11yAudit.spec.mjs`) to audit the selection toolbar and verify WCAG 2.2 touch target size and focus visibility across block handles, collapsibles, todo dates, and table controls in both light and dark themes.
- **Database Mount Probe Diagnostics (#278)**: Documented and formalized probe telemetry (`GET /api/databases/<id>/probe`). Clarified that probe availability is optional live telemetry (engine version and TLS posture) handled by the bridge as `{ available: false }` on upstream 404/429 without impacting database queries. Added `diagnoseMountProbe` pure diagnostic helper, architectural documentation in `docs/database-mount-probe.md`, and 10 unit tests in `tests/canvas/database-mount-probe-diagnostics.test.ts`.
- **AI Approval Card**: The user sees exactly what the assistant wants to write, and decides. When a run asks for the right to write, the service emits `permission.asked` and the chat draws a card under the answer: the tool in words, the target page by title and workspace, EVERY argument verbatim, the scope of the write, the page the request comes from, and the writes of the run that are already approved. The arguments, the titles and the preview are written as text nodes — never markup, never markdown, never an image the browser would fetch. Two real buttons, **Approve** and **Decline**, are the only way to decide: one click is one POST (`{decision}` and nothing else), a decision that is on its way refuses a second one, and a 409 refreshes the card from the service instead of showing an error. Each state says its own thing — waiting, writing, done, failed, declined, expired, and "may have been written — check the page" for the write whose outcome was never recorded. The card survives a reload: the run keeps the id of the approval on its assistant message, and the card is rebuilt from the row of the approval. The answer the assistant gives after the write is a run of its own, and the client attaches to it. A word in the conversation — typed, dictated or otherwise — never decides anything: the card listens to its own buttons and to nothing else.
- **AI Tool Activity**: The chat shows what the assistant is doing: one compact line per call of a tool, above the answer. The client parses the `tool.called` and `tool.result` frames the service already streams — where it parses the citations — and keeps them on the assistant message as parts: the name of the tool, a short label (the query of a search, the title of a page), the status of the call, and the number of passages it found. The count comes from the sources the call found: the service cites them between the call and its outcome. The result of a tool may carry the text of a page, and that text is never kept and never rendered. The queries and the titles are written as text nodes — never markup, never markdown. The lines fold to the last one when there are more than three, and a button (keyboard reachable, `aria-expanded`) unfolds them. A call that runs pulses, and the pulse honours the "reduce motion" of the reader.
- **AI Tools**: The assistant may call tools while it answers. Two of them, and both read: `search_workspace` (the passages of the caller's workspaces that answer a question) and `read_page` (the title and the text of one page). They live in one library (`services/osionos-ai/src/tools/`), and every tool has the same shape: a name, a description, a schema of arguments, and the work. The rule of the bridge decides what a tool may read (a page the caller may not read does not exist for them, and the tool never says why), the workspaces of the caller are read live at the moment of the call, and the text of a page is quoted as data — a page cannot forge a page of its own through a tool. The read tools hold no token of the caller: the token is a full-account bearer, and a read tool has no use for it. A run is a loop bounded at five steps, and the new events `tool.called` and `tool.result` say what the model asked and what the tool answered. The pages a tool found are sources of the answer, and are cited like the ones of the search.
- **MCP Policy Tests**: Added 18 unit tests for `mcpPolicy.ts` pure functions (`canConnectApp`, `addConnection`, `removeConnection`, `connectedAppIds`) covering edge cases including undefined `approvedApps` and idempotent connection adds.
- **Layout Tree Tests**: Added 27 unit tests for `layoutTree.ts` tree operations (`genId`, `findPane`, `collectPanes`, `updatePane`, `findOpenTab`, `activeTabOf`) covering DFS traversal, immutable updates, referential equality, and fallback chains.
- **Page Stamp Tests**: Added 27 unit tests for `pageStamp.ts` sync-engine functions (`isPersistablePage`, `pageStamp`, `buildDesiredPages`) covering stamp determinism, field sensitivity, `CONTENT_UNLOADED` sentinel invariant, content hash caching, and outbox filtering.
- **Pane Drop Zone Tests**: Added 21 unit tests for `paneDropZone.ts` geometry functions (`computeDropZone`, `zoneToSplit`) covering center/edge classification, corner nearest-edge resolution, custom thresholds, degenerate rects, and boundary conditions.
- **Responsive Layout Testing**: Added `responsiveLayout.spec.mjs` Playwright test suite to verify frontend responsiveness across desktop, tablet, and mobile viewports.

### Fixed
- **Bridge Content Validation Guard**: Enhanced `scripts/bridge-content-validation.mjs` to reject raw CSS class strings in stored content writes (`block.color`, `block.calloutTone`, and database `options[].color`) with 422 HTTP responses for issue #247.
- **Accessibility Remediation across Core Surfaces**:
  - `TableHeader`: Upgraded database view table header buttons ("Add property", "Column options") to 24x24px minimum touch targets and added token-driven focus outline rings to all header action and column trigger buttons (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `MemoTableRow`: Upgraded database view row drag grip and sub-items expand chevron to 24x24px minimum touch targets with token-driven focus outline rings, keeping `tabIndex={-1}` on the grip to preserve single-tab-stop grid navigation and adjusting lane padding to preserve cell text clearance (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `TableAddButton`: Upgraded table edge add button and quick-count flyout to 24x24px minimum touch targets with token-driven focus outline rings and keyboard focus-within visibility (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `BlockEditorSurface`: Upgraded universal block drag handle to 24x24px minimum touch target with token-driven focus outline ring and keyboard focus visibility (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `AiMenu`: Removed `role="menuitem"` from toolbar AI action buttons, resolving `aria-required-parent` violations (WCAG 2.2 SC 1.3.1).
  - `TurnIntoMenu`: Synchronized trigger button accessible name with visible block type label, resolving `label-content-name-mismatch` (WCAG 2.2 SC 2.5.3).
  - `FormatGrid`: Promoted background color highlighter into standalone 36x36px `ToolbarIconButton` with 6-column layout, eliminating touch target overlap and satisfying minimum target size with token-driven focus ring (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `TodoDueDate`: Upgraded floating "Add date" affordance and active due date button to 24px minimum touch targets with token-driven focus outline rings (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `TableParts`: Upgraded table row drag handle to 24x24px minimum touch target with focus ring and margin offset (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `BlockCollapseToggle` & `ToggleBlockEditor`: Upgraded block collapse/expand chevrons to 24x24px minimum touch targets with token-driven `:focus-visible` outline rings, preserving text baseline alignment via negative margins (WCAG 2.2 SC 2.5.8, SC 2.4.11).
  - `SettingsSectionsNav`: Adjusted settings navigation column layout to handle horizontal and vertical list overflow, ensuring active items stay visible and touch targets remain unoccluded (WCAG 2.2 SC 2.5.8).
- **Node Installer & Launcher**: `install.sh` writes the `~/.local/bin/osionos` executable wrapper before checking arguments, ensuring it is created on install and update runs without arguments. The launcher handles `update` and `open <folder>`, `cli.mjs` exposes the `update` subcommand, and running an update on an already-configured node restarts the background service.
- Replaced dynamic test-source execution with Node module mocks; made collaborative block ordering explicit and kept terminal resize framing outside the numeric regex for the PR quality gate.
- Hardened relay registry validation and writes, page sharing concurrency, and live collaboration authorization and hydration. Corrected GPU benchmark failure propagation, workload overlap, sampling duration, and unsupported co-location guidance.
- **AI Budget**: The reservation of a run is the cost of the WHOLE loop (five steps), not of its first call: a run that reserves for one call and spends five books a spend the cap never allowed. The ledger books the real cost, and never more than the reservation, so a settlement can never push the daily cap over.
- **AI Run Row**: The row of a run is closed before the terminal frame (`error`), the way the success path already does it: a client that reads the row when it sees the frame reads the truth.
- **Mobile TopBar Overflow**: Fixed an issue where the TopBar exceeded the mobile viewport width (375px) by hiding non-essential elements (`TopBarMenu`, `SharedSpacePresenceBar`, `QuickCaptureButton`, `UpdateButton`, and the brand name) using Tailwind responsive classes (`hidden md:block`, `hidden sm:flex`).
- **Responsive Tests Stability**: Improved the robustness of the responsive layout tests by creating an `overflowDetector` that safely ignores expected overflow from the fixed-width toggleable sidebar panel.

- **Page Deletion Feature**: Implemented FSD-compliant page deletion functionality.
  - Created `PageOptionsMenu` feature slice (`src/features/page-management`) for the dropdown options menu containing the "Delete" action.
  - Created `ConfirmDeleteModal` for safe deletion confirmation.
  - Integrated deletion into both "Private" workspace pages and the "Recents" list.
- **Side Panel Hide Functionality**: Implemented the ability to collapse and expand the osionos-style sidebar.
  - Added a "Close sidebar" button in the `WorkspaceSwitcher` component.
  - Added a floating `SidebarTrigger` component that appears when the sidebar is closed.
  - Added `$sidebar-width` to spacing tokens (`src/app/styles/base/tokens/_spacing.scss`).
  - Added smooth CSS transitions for sidebar width and transform (`src/widgets/sidebar/ui/Sidebar.module.scss`).

- **Shared UI Store (`src/shared/config/uiStore.ts`)**: 
  - Created a new Zustand store to manage global UI state.
  - `isSidebarOpen` (boolean): Tracks the visibility state of the sidebar.
  - `setSidebarOpen(open: boolean)`: Action to explicitly set the sidebar state.
  - `toggleSidebar()`: Action to toggle the sidebar state.
  - Integrated `zustand/middleware` for `localStorage` persistence (`ui-storage`), ensuring the sidebar state is remembered across browser sessions.

### Changed
- **Button Label Single Source of Truth**: Canonicalized button block label to `content` field, deprecated legacy `buttonLabel` with backward-compatible fallback via pure helper `buttonBlockLabel`, and updated button renderers, settings popover, markdown serialization, and seed catalog helpers for issue #247.
- **Honest Callout Fields & Legacy Color Adapter**: Refactored callout block data model to separate honest fields `calloutIcon` (display emoji or icon) and `calloutTone` (semantic tone), deprecated the legacy `color` field with backward-compatible resolution via `resolveCalloutProps`, and updated callout renderers, editors, slash commands, and seed helpers for issue #247.
- **Database Select Option Semantic Colors**: Migrated select and status option colors in notion-database-sys (`TAG_COLORS`) to semantic color names (`red`, `blue`, `green`, `yellow`, `purple`, `pink`, `cyan`, `orange`), added `tagColorClass` backward-compatible adapter resolving both semantic keys and legacy Tailwind strings, and updated pill badge renderers across table cells, editors, and feed cards for issue #247.
- Enhanced `MediaAssetPicker` (`src/shared/ui/molecules/MediaAssetPicker`) with search query debouncing (300ms), a one-click clear search button, strict `CoverPickerAsset[]` typing, and accessible `role="search"`/`role="searchbox"` semantics with live status announcements.
- Enhanced `EquationView` (`src/shared/ui/atoms/EquationView`) with WCAG-compliant `role="math"` semantics, accessible formula aria labels, and a 1-click raw LaTeX copy button with temporary checkmark feedback.
- Hardened KaTeX runtime (`src/shared/lib/math/katexRuntime.ts`) by enforcing `trust: false` on math rendering options to prevent untrusted LaTeX command execution.
- Enhanced `NoteComposeModal` with accessible form labeling (`aria-label`), `aria-hidden` visual heading to eliminate duplicate screen reader announcements, `Cmd+Enter`/`Ctrl+Enter` keyboard submission, and inline visual error feedback on rejection.
- Standardized default asset picker label to English ('Asset picker') and added ARIA tablist semantics (`role="tablist"`, `role="tab"`, `aria-selected`, `tabIndex`) in `CompactAssetPickerBoard`.
- Refactored `PageTreeItem` and `SidebarNavItem` from native `<button>` elements to `<div role="button">` to resolve nested button DOM hierarchy errors while maintaining accessibility.
- Updated `SidebarPageTree` to support hover actions ("Add child page" and "Options") in the "Recents" section, aligning its functionality with the "Private" section.
- Improved `usePageStore` delete action to automatically filter and persist the updated `recents` list when a page is deleted.
- Refactored `osionosSidebar.tsx` to `Sidebar.tsx`, integrating the new `useUIStore` to conditionally apply CSS classes for the closed state.
- Updated `App.tsx` layout to include the `SidebarTrigger` and handle dynamic sidebar resizing.

### Fixed
- Replaced hardcoded dark slate color literal in `inlineTextStyles.ts` with a token-driven CSS fallback (`var(--osio-bg-muted)` / `color-mix`) for adaptive light/dark theme consistency.
- Added unit test suite for `inlineTextStyles` in `tests/canvas/inline-text-styles.test.ts`.
- Resolved offline page deletion by relaxing strict JWT validation in `PageOptionsMenu` to support local state manipulation.
- Fixed missing `PageOptionsMenu` dropdown positioning by restoring Tailwind `relative` utility classes.
- Fixed React duplicate key warnings in `PageCover` gallery by incorporating array indices into map keys.
- Corrected invalid `@types/node` version (`^25.6.0` to `^22.0.0`) in `package.json` to restore `make typecheck` functionality.
