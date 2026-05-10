# osionos Node Service

This image provides Node and pnpm for the osionos app inside Docker. Do not use host Node or host package-manager installs for this workspace.

## Normal Start

From the repository root:

```sh
docker compose up -d --build osionos-app
```

The service entrypoint installs dependencies into Docker-managed volumes and starts Vite on `http://localhost:3001`.

## One-Off Commands

Run package tooling through Docker Compose:

```sh
docker compose run --rm osionos-app pnpm exec tsc --noEmit
docker compose run --rm osionos-app pnpm exec vite build
```

If a lockfile update is intentional, refresh it through the container and commit the changed lockfile:

```sh
docker compose run --rm osionos-app pnpm install --lockfile-only --store-dir /pnpm/store
```

The complete runtime guide is [../../../../../../docs/howtouse.md](../../../../../../docs/howtouse.md).
