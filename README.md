# playground/ — Multi-User Sandbox

A separate Vite + React app for testing multi-user workflows. It connects to the Fastify API (`packages/api/`) and lets you switch between 3 pre-seeded users, each with their own workspaces and pages.

This is **not** the main app. The main app is in `src/`. This one exists to test:
- Multi-user auth (JWT login/signup)
- Workspace and page CRUD via REST API
- Block-based page editing through the API
- Real-time sync via WebSocket

## How it differs from src/

| | src/ | playground/ |
|---|---|---|
| Data source | Local files / direct DB via Vite middleware | Fastify REST API |
| State | Single `useDatabaseStore` (massive Zustand store) | `usePageStore` + `useUserStore` (small, focused) |
| Auth | None (single user) | JWT-based (login, signup, token refresh) |
| Users | 1 implicit user | 3 pre-seeded users |
| Port | 3000 | 3001 |

The playground reuses UI components from `src/` via the `@src` path alias (configured in `vite.config.ts`).

## How to run

Only Docker, Docker Compose, Make, and Git are expected on the host. Node.js, pnpm,
Vite, ESLint, TypeScript, and Playwright all run inside Docker.

```bash
# Start the full Docker stack: Vite on :3001 + MongoDB
make up

# Run quality gates inside Docker
make ci

# Run browser tests inside Docker
make test
```

Full reset (wipe DB + re-seed):

```bash
make re
```

Build and release the production image:

```bash
make tag VERSION=v1.0.0
```

The release target builds `dlesieur/osionos:<VERSION>` with a multi-stage Docker
build, pushes `dlesieur/osionos:<VERSION>` and `dlesieur/osionos:latest`, creates
the git tag, and pushes the current branch plus the tag.

## Pre-seeded users

The seed script (`scripts/seed-playground.mjs`) creates 3 users:

| User | Email | Password |
|---|---|---|
| Alice | alice@test.com | password123 |
| Bob | bob@test.com | password123 |
| Charlie | charlie@test.com | password123 |

Each user gets their own workspace. Log in as any of them to see their pages.

## Seed data

`src/data/seedPages.ts` defines pre-built pages with real block content (headings, paragraphs, code blocks, todos, etc.). These get inserted via the API during seeding so you can immediately test the rendering pipeline.

## Directory structure

| File/Directory | What it is |
|---|---|
| `src/App.tsx` | Root component — sidebar + main content |
| `src/main.tsx` | React entry point |
| `src/api/client.ts` | HTTP client wrapper for the Fastify API |
| `src/store/usePageStore.ts` | Zustand store for pages and blocks |
| `src/store/useUserStore.ts` | Zustand store for auth state (current user, token) |
| `src/data/seedPages.ts` | Seed page definitions with block content |
| `src/hooks/usePlaygroundBlockEditor.ts` | Block editor hook adapted for API-backed editing |
| `src/components/` | Playground-specific components (sidebar, page editor, block renderer) |
| `vite.config.ts` | Vite config — `@src` alias points to `../src` for component reuse |
# osionos
