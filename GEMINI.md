# osionos Playground — GEMINI Context

A multi-user sandbox and playground for the osionos Database System. It simulates a collaborative, block-based workspace environment with support for both online (API-backed) and offline (local-first seed data) modes.

## Project Overview

- **Purpose:** A Vite + React application for testing multi-user workflows, workspace/page CRUD, and real-time synchronization.
- **Main Technologies:**
    - **Frontend:** React 19, Vite 6, TypeScript, Zustand 5, Tailwind CSS 4.
    - **Database:** MongoDB (via Docker).
    - **Custom Logic:** Integrates a custom markdown engine (`markengine`) for block parsing and rendering.
- **Architecture:** 
    - A flat but organized structure within `src/` (components, stores, lib, api, types, hooks, data).
    - Uses `@/` as a path alias for `src/`.
    - Integrates `markengine` as a submodule (mapped to `src/lib/markengine.ts`).

## Building and Running

Commands are available via a central `Makefile`.

### Core Commands
- `make install`: Install Node dependencies locally (Node 22+).
- `make dev`: Start the Vite dev server on `http://localhost:3001` (offline mode by default).
- `make dev-docker` (or `make up`): Start the full stack (Vite :3001 + MongoDB).
- `make build`: Build for production (output in `./build`).
- `make typecheck`: Run TypeScript type-checking.

### Database Management
- `make db-up`: Start only MongoDB.
- `make db-shell`: Open `mongosh` in the running MongoDB container.
- `make db-reset`: Wipe MongoDB data and restart.
- `make re`: Full restart — wipe everything and start fresh.

## Development Conventions

### State Management (Zustand)
- `useUserStore.ts`: Manages multi-user authentication (simulated with 3 personas: Alice, Bob, Charlie).
- `usePageStore.ts`: Manages pages, workspaces, and block-based content. Supports local seed data fallback when offline.

### Multi-User Support
The app pre-seeds 3 users on mount (`App.tsx`):
- **Alice** (`alice@test.com`)
- **Bob** (`bob@test.com`)
- **Charlie** (`charlie@test.com`)
Passwords for all are `password123`. Each user has private and shared workspaces.

### Block System
Content is modeled as blocks (headings, paragraphs, code, callouts, etc.).
- **Editing:** Handled via `src/components/BlockEditor.tsx` and related block editors (e.g., `TodoBlockEditor.tsx`).
- **Rendering:** `PageBlocksRenderer.tsx` and `ReadOnlyBlock.tsx`.
- **Markdown Engine:** Integrated via `src/lib/markengine.ts` for parsing shortcuts and block detection.

### Theming
A custom theme system is located in `src/lib/theme.ts`. It manages light/dark modes and uses CSS variables for design tokens.

### Seed Data
Offline mode uses seed data from `src/data/seedPages.ts`, `src/data/seedAdminPages.ts`, and `src/data/seedUserPages.ts` to provide a functional UI without a backend.
