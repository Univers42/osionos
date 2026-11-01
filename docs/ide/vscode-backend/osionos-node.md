# osionos-node: open a folder on this machine (Phase 1)

`osionos-node serve` runs this machine's VS Code server on a private Unix socket and serves the
IDE origin in front of it. The app's `/machine?node=<id>&folder=<absolute path>` opens that origin
as its own window and hands it a node-scoped token that needs a fresh step-up (ADR-006, devil
verdict 2026-10-30). Not a frame: the app and a machine are two sites, and a cross-site frame
never gets its `SameSite=Strict` cookie (C0-F1, measured by the second test in tests/machine).

## Run it

```sh
pnpm build:ide                                  # builds dist-ide/, the IDE page
OSIONOS_IDE_TOKEN_SECRET=<the bridge's IDE secret> \
OSIONOS_IDE_OWNER=<your user id> \
node packages/osionos-node/cli.mjs serve \
  --node laptop \
  --server <unpacked code-server-4.138.0>/lib \
  --app-origin https://<the app's origin> \
  --listen 127.0.0.1:4100                       # loopback, RFC 1918 or tailnet only
```

The app looks for the IDE origin at `http://127.0.0.1:4100`, osionos-node's default; set
`VITE_OSIONOS_MACHINE_URL` at build time for another address (`--ide-origin` when a reverse proxy
fronts it). The server bundle is the one pinned in `packages/osionos-node/server-pin.json`;
check its sha256 against that file before unpacking.

## What is verified

`tests/machine/ide-machine.e2e.test.mjs` runs the real server through the real IDE origin in
Chromium, with the app and the IDE on two sites (`localhost`, `127.0.0.1`). Edits save to disk; the folder's tasks stay off until the owner trusts it (VS Code's
own trust dialog); the terminal is the owner's login shell, in the folder; the frame refuses
terminal input and `.git` paths from the app; the HAR carries no connection token value; the node
cookie is HttpOnly; and the page reports no CSP violation. It needs `OSIONOS_SERVER_LIB` and
`dist-ide/`, so CI reports it as skipped. Run it locally:

```sh
OSIONOS_SERVER_LIB=<.../lib> OSIONOS_E2E_CHROME=<chrome> node --test tests/machine/ide-machine.e2e.test.mjs
```

## Not done yet

- **C11, the debug half:** that a debug launch is refused while untrusted is not tested yet.
- **The app side:** `/machine` was not run against the live bridge as dev.pro.photo@gmail.com.
  It needs a running osionos-node and `VITE_OSIONOS_MACHINE_URL` in the deployed app.
- **Desktop app:** its edition is blocked (C21, C23).
- **Connection token:** VS Code appends an empty `tkn=` to resource URLs when it has no token.
  The proxy drops the parameter.
