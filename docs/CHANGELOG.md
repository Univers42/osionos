# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Side Panel Hide Functionality**: Implemented the ability to collapse and expand the Notion-style sidebar.
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
- Refactored `NotionSidebar.tsx` to `Sidebar.tsx`, integrating the new `useUIStore` to conditionally apply CSS classes for the closed state.
- Updated `App.tsx` layout to include the `SidebarTrigger` and handle dynamic sidebar resizing.
