# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **MCP Policy Tests**: Added 18 unit tests for `mcpPolicy.ts` pure functions (`canConnectApp`, `addConnection`, `removeConnection`, `connectedAppIds`) covering edge cases including undefined `approvedApps` and idempotent connection adds.
- **Layout Tree Tests**: Added 27 unit tests for `layoutTree.ts` tree operations (`genId`, `findPane`, `collectPanes`, `updatePane`, `findOpenTab`, `activeTabOf`) covering DFS traversal, immutable updates, referential equality, and fallback chains.
- **Responsive Layout Testing**: Added `responsiveLayout.spec.mjs` Playwright test suite to verify frontend responsiveness across desktop, tablet, and mobile viewports.

### Fixed
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
