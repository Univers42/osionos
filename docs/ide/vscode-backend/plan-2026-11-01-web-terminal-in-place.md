# The web terminal opens in place, in the app's dock (plan, 2026-11-01)

## The problem the owner reported

On the web, Terminal → New Terminal opens a second browser window on `http://127.0.0.1:4100`
(this computer's osionos-node) and the shell lives there. The owner rejects it: "don't open
another window … people will never accept to use the tools otherwise". The terminal must open
in the dock, in place, like the desktop app's (VS Code's own terminal panel), on this computer's
shell, with security kept.

## Why it is a window today

- ADR 0034, C0-F1: the node session is an HttpOnly cookie, `SameSite=Strict`. A frame on
  127.0.0.1 under the app's site is cross-site, so the cookie is never sent; `SameSite=None` is
  forbidden. ADR 0036 then chose a top-level window, handed a session through `window.opener`.
- The whole VS Code workbench needs that cookie on every request. A terminal does not: it needs
  a page (static) and one WebSocket per shell.

## The design

Terminal only, in place. The IDE (editor, explorer) keeps its window for now.

1. **The page.** osionos-node serves the terminal page the desktop already uses (VS Code's
   terminal panel, `src/terminal-client`, built by `vite.terminal.config.ts`) at
   `http://127.0.0.1:4100/terminal/`. Static, no session, no secret.
   - `Content-Security-Policy: frame-ancestors <each --app-origin>`: only the app may frame it.
   - `connect-src 'self'`: the page reaches only its own node.
2. **The frame.** On the web, the dock's terminal panel (`LocalVsCodeTerminal`, the desktop's
   component) renders `<iframe src="http://127.0.0.1:4100/terminal/index.html"
   allow="local-network-access; clipboard-read; clipboard-write">`.
   - The app knows the frame by its `contentWindow` and posts to it with targetOrigin exactly
     `http://127.0.0.1:4100`.
   - The page accepts messages only from `window.parent === window.top` whose origin is one of
     the node's `--app-origin` values (the node writes them into the page; the page cannot be
     told another).
3. **Proving it is the owner, without a cookie.** The app mints the machine token as today:
   step-up "Confirm it's you" in the dock, then `POST /api/machines/:id/token` (bridge-signed,
   ed25519, owner-only, audience = this node, 900 s, jti; ADR 0037). It posts the token to the
   frame. For each shell the frame opens `ws://127.0.0.1:4100/api/pty`, and the first message
   is `{ token }`.
   - The node verifies it exactly as `/api/node/session` does: signature, owner, this node's id,
     expiry, jti once. Anything else, or no first message within 5 s, closes the socket (4401).
   - The WebSocket's `Origin` must be `http://127.0.0.1:4100` (the frame's own origin), and
     the upgrade is refused for any other `Host`.
   - One token opens one shell. A new shell needs a new token: the frame asks the app
     (`osionos-term/need-token`), the app mints one (no new step-up within the step-up window).
4. **The shell.** The node spawns it with the `node-pty` that ships inside the pinned VS Code
   server (`<server>/vscode/node_modules/node-pty`), as the node's own user, in `$HOME`, with
   `$SHELL`. The wire is the desktop's pty port contract, unchanged:
   frame → node `{op:'write', data}` (≤ 65536), `{op:'resize', cols, rows}` (1..1000),
   `{op:'ack', chars}`; node → frame `{op:'data', data}`, `{op:'exit', exitCode}`, then close.
   Flow control as the desktop's. At most 8 shells per node.
5. **Expiry.** A shell outlives its 900 s token: the token gates the opening, not the life,
   as a terminal in VS Code does. Closing the frame (navigating away, closing the dock or
   the tab) closes the sockets, and the node kills the pty.
6. **Local Network Access.** Chrome asks the person once ("this site wants to connect to apps
   on your device"). The dock says why before the prompt appears. A refusal, or no node, ends in
   the dock's existing "not running" panel with the start command, never a blank frame.

## What it does not do

- It does not put the IDE (editor, explorer) in place; that keeps its window until a later ruling.
- It does not pair a computer from the browser.
- A computer whose node predates this change has no `/terminal/` or `/api/pty`: the dock shows
  "update osionos-node" with the command.

## Unknowns

- U1: does Chrome send the LNA prompt for an iframe navigation to 127.0.0.1 and for the frame's
  WebSocket, and does Firefox (no LNA) frame it with no prompt? To be measured.
- U2: does `require()` of the server's node-pty load under the node's own Node (the server ships
  its own `node` binary; ABI must match)? If not, the pty runs under the server's node.
- U3: is a `SameSite`-free token in a frame's memory acceptable where the cookie design kept it
  out of JavaScript? The app already holds the same token today.
