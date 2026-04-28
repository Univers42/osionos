# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- Refactored `PageTreeItem` and `SidebarNavItem` from native `<button>` elements to `<div role="button">` to resolve nested button DOM hierarchy errors while maintaining accessibility.
- Updated `SidebarPageTree` to support hover actions ("Add child page" and "Options") in the "Recents" section, aligning its functionality with the "Private" section.
- Improved `usePageStore` delete action to automatically filter and persist the updated `recents` list when a page is deleted.
- Refactored `osionosSidebar.tsx` to `Sidebar.tsx`, integrating the new `useUIStore` to conditionally apply CSS classes for the closed state.
- Updated `App.tsx` layout to include the `SidebarTrigger` and handle dynamic sidebar resizing.

### Fixed
- Resolved offline page deletion by relaxing strict JWT validation in `PageOptionsMenu` to support local state manipulation.
- Fixed missing `PageOptionsMenu` dropdown positioning by restoring Tailwind `relative` utility classes.
- Fixed React duplicate key warnings in `PageCover` gallery by incorporating array indices into map keys.
- Corrected invalid `@types/node` version (`^25.6.0` to `^22.0.0`) in `package.json` to restore `make typecheck` functionality.
