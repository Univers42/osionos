# Node.js / pnpm / Turborepo — Cheatsheet

> **Stack**: Node 22 (Alpine) · pnpm 10 · Turborepo 2.9 · TypeScript 5  
> Everything runs **inside Docker** — you never need Node on your host.

---

## Table of contents

1. [How it works in this project](#how-it-works-in-this-project)
2. [pnpm — the package manager](#pnpm--the-package-manager)
3. [Turborepo — the monorepo build system](#turborepo--the-monorepo-build-system)
4. [Node.js runtime](#nodejs-runtime)
5. [TypeScript compiler](#typescript-compiler)
6. [Dockerfile & entrypoint](#dockerfile--entrypoint)
7. [Troubleshooting](#troubleshooting)

---

## How it works in this project

The `Dockerfile` builds a lightweight Node 22 Alpine image with pnpm pre-activated.
The `entrypoint.sh` runs **before** every container command and does two things:

1. **Installs deps** if `pnpm-lock.yaml` changed since last install
2. **Builds packages** (`types → core → api`) if `dist/` is missing

After that, whatever command you passed (`pnpm dev:src`, `pnpm dev:api`, etc.) takes over.

```
Host ── docker compose up ──► entrypoint.sh ──► pnpm install ──► pnpm turbo build ──► your command
```

The project root is bind-mounted at `/app`, and `node_modules/` lives in a named Docker volume
so it persists across restarts but doesn't leak onto your host filesystem.

---

## pnpm — the package manager

pnpm is what npm should have been. It uses a content-addressable store and hard links,
so installing 200 packages across 4 workspaces doesn't duplicate a single byte.

### Basics

```bash
# Install all dependencies (reads pnpm-lock.yaml)
pnpm install

# Install with exact lockfile (CI, Docker — fails if lock is outdated)
pnpm install --frozen-lockfile

# Add a dependency to the root
pnpm add -w lodash

# Add a dev dependency to a specific workspace
pnpm add -D --filter @notion-db/api vitest

# Remove a dependency
pnpm remove -w lodash

# Update all deps interactively
pnpm update -i -r

# Update a single package across all workspaces
pnpm update -r typescript

# See what's outdated
pnpm outdated -r
```

### Workspaces

This monorepo has 4 workspaces defined in `pnpm-workspace.yaml`:

| Workspace | Path | What it is |
|---|---|---|
| `@notion-db/types` | `packages/types` | Shared TypeScript types |
| `@notion-db/core` | `packages/core` | Business logic, Mongoose models |
| `@notion-db/api` | `packages/api` | Fastify API server |
| *(root)* | `.` | src app + playground + scripts |

```bash
# Run a script in a specific workspace
pnpm --filter @notion-db/api dev

# Run a script in ALL workspaces that have it
pnpm -r run build

# Run a script only in packages/ workspaces
pnpm --filter './packages/*' run build

# List all workspaces
pnpm -r ls --depth -1

# Check why a package is installed
pnpm why react

# Check why in a specific workspace
pnpm why --filter @notion-db/api mongoose

# Execute a binary from node_modules
pnpm exec tsc --version

# Shorthand — run a node_modules/.bin command
pnpm dlx create-vite my-project
```

### Scripts (from root `package.json`)

```bash
pnpm dev:src         # Vite dev server on :3000
pnpm dev:playground  # Vite dev server on :3001
pnpm dev:api         # Fastify API on :4000
pnpm build           # Build all packages via Turbo
```

### Lock file & store

```bash
# Regenerate lock from package.json (when you edited it manually)
pnpm install --no-frozen-lockfile

# Prune the global store (remove orphaned packages)
pnpm store prune

# Check store integrity
pnpm store status

# Where is the store?
pnpm store path
```

---

## Turborepo — the monorepo build system

Turbo runs tasks in dependency order with smart caching. If nothing changed, it skips the work.

### Running tasks

```bash
# Build all packages (types → core → api, auto-ordered)
pnpm turbo run build

# Build only packages/ (skip root)
pnpm turbo run build --filter='./packages/*'

# Build a single package and all its dependencies
pnpm turbo run build --filter=@notion-db/api...

# Build only what changed since main
pnpm turbo run build --filter='...[main]'

# Dry-run — show what WOULD run without doing it
pnpm turbo run build --dry-run

# Dry-run in JSON (great for scripting/debugging)
pnpm turbo run build --dry-run=json

# Force — ignore cache, rebuild everything
pnpm turbo run build --force

# Run with verbose output
pnpm turbo run build --verbosity=2
```

### Cache management

Turbo caches build outputs (hashes of inputs → cached outputs). This is why repeated
builds say `FULL TURBO` and finish in milliseconds.

```bash
# See what's cached
ls -la node_modules/.cache/turbo/

# Nuke the local cache
rm -rf node_modules/.cache/turbo/

# Disable cache for one run
pnpm turbo run build --no-cache

# Show the hash for each task (debug cache misses)
pnpm turbo run build --summarize
```

### The turbo.json config

Key concepts in our `turbo.json`:

- **`build`**: depends on `^build` (parent packages build first)
- **`dev`**: persistent task (never "finishes"), uses cache: false
- **`globalPassThroughEnv`**: env vars turbo passes into tasks (MONGO_*, POSTGRES_*, etc.)

```bash
# View the resolved config
pnpm turbo config

# View the task graph (which tasks depend on what)
pnpm turbo run build --graph
```

### Filtering cheatsheet

| Pattern | Meaning |
|---|---|
| `--filter=@notion-db/api` | Just this package |
| `--filter=@notion-db/api...` | This package + all deps |
| `--filter=...@notion-db/api` | This package + all dependents |
| `--filter='./packages/*'` | All packages in packages/ |
| `--filter='...[HEAD~1]'` | Everything changed in last commit |
| `--filter='...[main]'` | Everything changed since main branch |

---

## Node.js runtime

Quick reference for Node stuff you'll use in this project.

```bash
# Check Node version
node --version       # v22.x.x

# Run a TypeScript file directly (Node 22 has --experimental-strip-types)
node --experimental-strip-types scripts/generate-state-files.ts

# Run with tsx (better TS support, used by our scripts)
pnpm exec tsx scripts/some-script.ts

# Node REPL with ESM support
node --input-type=module

# Inspect memory usage in a script
node --max-old-space-size=4096 script.js

# Debug a script (opens Chrome DevTools)
node --inspect-brk script.js

# Print the module resolution for an import
node --experimental-import-meta-resolve -e "import.meta.resolve('react')"

# Environment variables
NODE_ENV=production node script.js

# Useful env vars in this project
echo $ACTIVE_DB_SOURCE    # json | csv | mongodb | postgresql
echo $MONGO_URI           # mongodb://...
echo $DATABASE_URL        # postgresql://...
```

---

## TypeScript compiler

We use `tsc` for type-checking and building packages (emitting `.d.ts` + `.js`).
Vite handles the actual bundling for the apps.

```bash
# Type-check the whole project (no output, just errors)
pnpm tsc --noEmit

# Type-check and watch for changes
pnpm tsc --noEmit --watch

# Build a specific package (emits to dist/)
pnpm tsc --build packages/types/tsconfig.json

# Build all packages in order
pnpm turbo run build --filter='./packages/*'

# Show the resolved tsconfig (what tsc actually sees)
pnpm tsc --showConfig

# Show the resolved config for a specific file
pnpm tsc --showConfig -p packages/api/tsconfig.json

# List all files tsc will compile
pnpm tsc --listFiles --noEmit | head -20

# Trace type resolution for debugging weird type errors
pnpm tsc --traceResolution --noEmit 2>&1 | grep "your-module"

# Generate a build trace (performance debugging)
pnpm tsc --generateTrace ./trace-output

# Check which version
pnpm tsc --version
```

### tsconfig structure

```
tsconfig.json  (root — strict mode, DOM + JSX for src app, base for packages)
├── packages/types/tsconfig.json   (extends root, emits .d.ts)
├── packages/core/tsconfig.json    (extends root, emits .d.ts)
├── packages/api/tsconfig.json     (extends root, emits .d.ts)
└── playground/tsconfig.json       (Vite handles this one)
```

---

## Dockerfile & entrypoint

### The Dockerfile

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache python3 make g++ cmake git bash
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app
COPY docker/services/node/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
```

Why these system packages?
- **python3 / make / g++**: native module compilation (some npm packages need this)
- **cmake**: ditto, for native addons
- **git**: turbo uses git for dirty-hash detection (change tracking)
- **bash**: scripts need bash, alpine only ships sh

### Running commands inside the container

```bash
# Open a shell inside the running src container
docker exec -it notion_src sh

# Run a one-off command
docker compose run --rm src-app pnpm tsc --noEmit

# Check what's inside
docker compose run --rm src-app ls -la /app/node_modules/.pnpm

# View entrypoint logs
docker compose logs -f notion_src 2>&1 | head -20
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `FROZEN_LOCKFILE_ERROR` | Lockfile outdated. Run `pnpm install` locally, commit the updated `pnpm-lock.yaml`. |
| `Cannot find module '@notion-db/types'` | Packages not built. Run `make typecheck` or `pnpm turbo run build --filter='./packages/*'`. |
| `FULL TURBO` but code seems stale | Cache is stale. `rm -rf node_modules/.cache/turbo/` and retry. |
| Node modules gone after rebuild | Expected — named volume was wiped. Entrypoint will re-install automatically. |
| pnpm version mismatch warning | Update `corepack prepare pnpm@X.Y.Z` in the Dockerfile to match `package.json`'s `packageManager` field. |
| `git dubious ownership` | Already handled by `entrypoint.sh` (`git config --global --add safe.directory /app`). |
| TypeScript errors only in Docker | The Docker container sees the same code but uses the container's TS version. Check `pnpm tsc --version` inside the container. |

---

*Last updated: April 2026*
