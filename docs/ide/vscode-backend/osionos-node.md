# osionos-node: open a folder on this machine (Phase 1)

`osionos-node serve` runs this machine's VS Code server on a private Unix socket and serves the
IDE origin in front of it. The app's `/machine?node=<id>&folder=<absolute path>` opens that origin
as its own window and hands it a node-scoped token that needs a fresh step-up (ADR-006, devil
verdict 2026-10-30). Not a frame: the app and a machine are two sites, and a cross-site frame
never gets its `SameSite=Strict` cookie (C0-F1, measured by the second test in tests/machine).

## Connect a computer

The app shows one command, and it is the supported path:

```sh
curl -fsSL https://raw.githubusercontent.com/Univers42/osionos/main/packages/osionos-node/install.sh \
  | sh -s -- --bridge <bridge url> --app-origin <app origin>
```

It installs or updates osionos-node, pairs this machine, renewing a code that expires, and
serves it. Leave it running. Enter the code in the app's Terminal panel. Running it again
updates the checkout and rebuilds the pages, which is the fix for a node older than the app.

## Run it by hand

```sh
pnpm build:ide                                  # builds dist-ide/, the IDE page
OSIONOS_IDE_TOKEN_SECRET=<the bridge's IDE secret> \
OSIONOS_IDE_OWNER=<your user id> \
node packages/osionos-node/cli.mjs serve \
  --node laptop \
  --server <unpacked code-server-4.138.0>/lib \
  --app-origin https://<the app's origin> \
  --app-origin app://osionos \
  --listen 127.0.0.1:4100                       # loopback, RFC 1918 or tailnet only
```

The app looks for the IDE origin at `http://127.0.0.1:4100`, osionos-node's default; set
`VITE_OSIONOS_MACHINE_URL` at build time for another address (`--ide-origin` when a reverse proxy
fronts it). `--app-origin` repeats: the second one above is the desktop app. The server bundle is the one pinned in `packages/osionos-node/server-pin.json`;
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

A debug launch (F5) in an untrusted folder asks for trust and runs nothing when declined; once
trusted, the same launch runs (C11).

Live, 2026-10-31: the deployed app at `https://baas.tail10f2ea.ts.net:8443/machine` signed in as
the owner, passed the emailed step-up, opened this laptop's folder in its own window, saved an
edit to disk and ran the owner's shell in the folder. The step-up needs grobase's email OTP
(`EMAIL_OTP_ENABLED=true` on tenant-control); without it the bridge answers 503.

Desktop, 2026-10-31 (C23): the real `main.js` (Electron 32.2.7, in the groot smoke container) did
the same. It signed in, passed the emailed step-up and opened the IDE as a child window of
`app://osionos`. The editor connected, saved to disk, and the terminal wrote its probe. No node
cookie or connection token is readable by script or recorded in the HAR, and the node refuses
`app://osionos` itself. The node then needs `--app-origin app://osionos` beside the web origin.

## Not done yet

- **Remote machines** (SSH, tunnel) are Phase 3 and Phase 6. A non-loopback http node in the desktop
  app is not ruled on (C6 amendment, condition 7).
- **Connection token:** VS Code appends an empty `tkn=` to resource URLs when it has no token.
  The proxy drops the parameter.
