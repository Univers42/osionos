# osionos app

Vite + React app served by the root Docker Compose stack at `http://localhost:3001`.

Do not install app dependencies on the host. Node, pnpm, Vite, TypeScript, linting, and browser tooling run inside Docker containers and Docker-managed volumes.

## Run

From the repository root:

```sh
docker compose up -d --build osionos-app osionos-bridge
```

For the normal website login flow, run the complete stack:

```sh
docker compose up -d --build
```

Then open `http://localhost:4322`, sign in, and let the website redirect into osionos. Direct app loads require an existing bridge session unless `VITE_REQUIRE_BRIDGE_SESSION` is changed inside the Docker configuration.

## Bridge

- Bridge API: `http://localhost:4000`
- Token consume route: `http://localhost:4000/api/auth/bridge/consume`
- App URL after token consumption: `http://localhost:3001/#source=adapter&view=v-prod-table`

See [../../../docs/howtouse.md](../../../docs/howtouse.md) for the full pipeline workflow and verification steps.
