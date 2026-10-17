// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    bridge-ide-exec.mjs                                :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// WS exec-attach relay: the interactive shell (P3, /api/ide/pty), the LSP
// transport (P5, /api/ide/lsp), the DAP transport (P5, /api/ide/debug), and
// fs-sync (P4, /api/ide/fsync) — the SAME mechanism, differing only in argv.
// Bridges a browser WebSocket to a hijacked `docker exec` stream on the
// SERVER-derived sandbox container, through the P2 socket-proxy.
//
// Thin glue over tested parts: the WS frame codec (ide-ws, --selfcheck'd), the
// exec engine (ide-docker.runExec, live-tested), and the validated exec specs.
// The pure seams (resize parse, auth extraction, std-stream demux) are unit
// tested in tests/bridge/ide-exec-parse.test.mjs; the docker glue stays
// live-verified. Failures close with a WS code+reason (4001 auth · 4003 gate
// off · 4004 no sandbox · 4008 bad lang or adapter · 4011 token expired · 4013 overflow · 4029 throttled · 4137 LSP out of memory) so
// the frontend can say WHY instead of "[connection closed]".

import { handshake, encodeFrame, closeFrame, createFrameDecoder } from './ide-ws.mjs';
import { createDockerClient } from './ide-docker.mjs';
import { requireSandboxIdentity, buildShellExecSpec, buildFsAgentExecSpec } from './ide-sandbox-spec.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import {
  bumpContainerSockets, containerHasActivity, getOrCreateSession, attachClient, detachClient, writeStdin,
} from './ide-term-sessions.mjs';
import { ensureSandbox, sandboxNames } from './bridge-ide-sandbox.mjs';

// Each live socket pins bridge FDs; cap churn AND simultaneous streams per
// user so one tenant can't exhaust the shared bridge. (PTY SESSIONS outlive
// sockets — the caps count sockets, the reaper counts session activity.)
const MAX_CONCURRENT_EXEC = 6;
const activeExecByUser = new Map();

/** Whether this container has live sockets or recent session activity. */
export function hasActiveExec(containerName) {
  return containerHasActivity(containerName, 0);
}

// APC-wrapped PTY-resize control frame: `ESC _ osio-resize:COLS,ROWS ESC \`.
// Strict FULL-frame match — prefix-only matching let pasted bytes that happen
// to start with the magic trigger a bogus resize.
const RESIZE_RE = /^_osio-resize:(\d{1,4}),(\d{1,4})\\$/;

/** Parse a complete resize control frame; null for anything else (incl. paste
 *  noise). Exported pure for tests. */
export function parseResizeFrame(data) {
  if (data.length > 26) return null;
  const match = RESIZE_RE.exec(data.toString('latin1'));
  return match ? { cols: Number(match[1]), rows: Number(match[2]) } : null;
}

/** Auth rides the WS subprotocol (`osio-token.<jwt>` alongside `osio-ide.v1`)
 *  so the token stays out of URLs/access logs. The token comes ONLY from the
 *  subprotocol entry; a missing entry yields undefined, which the existing
 *  verify step already refuses. Exported pure for tests. */
export function extractWsAuth(request) {
  const offered = String(request.headers['sec-websocket-protocol'] ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const tokenEntry = offered.find((p) => p.startsWith('osio-token.'));
  return {
    token: tokenEntry ? tokenEntry.slice('osio-token.'.length) : undefined,
    protocol: offered.includes('osio-ide.v1') ? 'osio-ide.v1' : undefined,
  };
}

/** Demux docker's non-TTY exec stream (8-byte [type,0,0,0,len] frames) into raw
 *  stdout payloads. The LSP exec is Tty:false ON PURPOSE — a PTY would cook the
 *  protocol bytes (echo, CR/LF translation); the mux headers are stripped HERE
 *  instead so the browser's Content-Length deframer never desyncs. stderr
 *  (server logs) is dropped, not spliced into the protocol stream. */
export function createStdStreamDemux() {
  let pending = Buffer.alloc(0);
  return function feed(chunk) {
    pending = Buffer.concat([pending, chunk]);
    const payloads = [];
    while (pending.length >= 8) {
      const size = pending.readUInt32BE(4);
      if (pending.length < 8 + size) break;
      if (pending[0] === 1) payloads.push(pending.subarray(8, 8 + size));
      pending = pending.subarray(8 + size);
    }
    return payloads;
  };
}

/** Refuse a WS upgrade before the handshake: a plain HTTP status the browser
 *  surfaces in devtools (a close code needs a completed handshake first). */
function rejectUpgrade(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

// The only language servers we relay to (P5). Adding one = one line here + the
// server installed in the sandbox image. Command is server-fixed, never client.
export const LSP_SERVERS = Object.freeze({
  typescript: ['typescript-language-server', '--stdio'],
  python: ['pyright-langserver', '--stdio'],
  // gopls / rust-analyzer / clangd all speak LSP over stdio with no flag.
  go: ['gopls'],
  rust: ['rust-analyzer'],
  clangd: ['clangd'],
  // jdtls-launch pins the JRE 21 runtime, heap and oom_score_adj; argv stays server-fixed.
  java: ['jdtls-launch'],
});

// Debug adapters we relay to (P5). Server-fixed argv; Node is absent on purpose:
// js-debug needs Node >= 20 and the `startDebugging` reverse request, neither
// available in the sandbox image.
export const DAP_SERVERS = Object.freeze({
  python: ['debugpy-adapter'],
});

/** Return the argv array for `lang` from `table` only when `lang` is a string
 *  and an own property of `table`. This blocks prototype-pollution keys
 *  (`__proto__`, `constructor`, `toString`) that would otherwise return a
 *  truthy inherited value and reach docker as a non-array `Cmd`. */
export function serverCommand(table, lang) {
  if (typeof lang !== 'string' || !Object.hasOwn(table, lang)) {
    throw Object.assign(new Error('unsupported server'), { status: 400 });
  }
  return table[lang];
}

function lspExecSpec(lang) {
  const cmd = serverCommand(LSP_SERVERS, lang);
  return { User: '10001:10001', WorkingDir: '/workspace', AttachStdin: true, AttachStdout: true, AttachStderr: true, Cmd: cmd };
}

function dapExecSpec(lang) {
  const cmd = serverCommand(DAP_SERVERS, lang);
  return { User: '10001:10001', WorkingDir: '/workspace', AttachStdin: true, AttachStdout: true, AttachStderr: true, Cmd: cmd };
}

/** Map an LSP process exit code to a WS close frame. Exit 137 = OOM kill → 4137 with a named
 *  reason; everything else (including null/undefined) → 1000 'process ended'. Pure for tests. */
export function lspCloseFor(exitCode) {
  if (exitCode === 137) return { code: 4137, reason: 'language server out of memory' };
  return { code: 1000, reason: 'process ended' };
}

/** An IDE token lives at most 15 minutes; a socket opened with one must not outlive it. App tokens
 *  carry no `exp` here, so nothing is armed for them. `exp` is in seconds, `now` in ms.
 *  Ponytail: the timer is wall-clock; a host clock stepped backwards after arming closes the
 *  socket late (by the step), never early. */
export function armTokenExpiry(socket, exp, now = Date.now()) {
  if (!Number.isFinite(exp)) return;
  const timer = setTimeout(() => {
    if (!socket.destroyed) socket.end(closeFrame(4011, 'token expired'));
  }, Math.max(0, exp * 1000 - now));
  timer.unref();
  socket.once('close', () => clearTimeout(timer));
}

// A refusal the user can act on (every box in use: 503) goes out as the close reason; anything
// else stays generic on the wire and goes to the log. Both catches below used to swallow the
// error, so a full box cap and a refused create both read as "sandbox unavailable" with nothing
// logged, and the UI blamed docker-ide (2026-10-14).
function sandboxRefusal(kind, names, error, fallback) {
  console.warn(`[osionos-ide] ${kind} could not reach ${names.containerName}: ${error?.message ?? error}`);
  return error?.status === 503 && typeof error.message === 'string' ? error.message.slice(0, 120) : fallback;
}

/** Returns an upgrade handler `(request, socket) => boolean` — true when it owns
 *  the WS path. Attach to the bridge's http server `upgrade` event. `allowOrigin`
 *  is the browser-origin predicate (same allowlist as the REST CORS layer). */
export function createIdeExecUpgradeHandler({ config, verifySession, env = process.env, allowOrigin = () => true }) {
  return function handleIdeExecUpgrade(request, socket) {
    const url = new URL(request.url, 'http://ide.local');
    const isPty = url.pathname === '/api/ide/pty';
    const isLsp = url.pathname === '/api/ide/lsp';
    const isDap = url.pathname === '/api/ide/debug';
    const isFsync = url.pathname === '/api/ide/fsync';
    const isSafe = url.searchParams.get('safe') === '1';
    if (!isPty && !isLsp && !isDap && !isFsync) return false;

    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) { rejectUpgrade(socket, 404, 'Not Found'); return true; }
    // Browsers always send Origin on WS upgrades — refuse foreign pages. A
    // missing Origin (non-browser client) still has to pass token auth below.
    const origin = request.headers.origin;
    if (origin && !allowOrigin(origin)) { rejectUpgrade(socket, 403, 'Forbidden'); return true; }

    const auth = extractWsAuth(request);
    let userId, names, tokenExp;
    try {
      const session = verifySession(auth.token, config);
      const identity = requireSandboxIdentity(session, url.searchParams.get('workspaceId'), env);
      userId = identity.userId;
      tokenExp = session.exp;
      names = sandboxNames(identity);
    } catch (error) {
      // The status tells an unlisted account apart; the reason stays generic.
      if (error?.status === 403) rejectUpgrade(socket, 403, 'Forbidden');
      else rejectUpgrade(socket, 401, 'Unauthorized');
      return true;
    }

    // Throttle open-churn, then bound simultaneous streams per user.
    try { takeToken(`ide-exec:${userId}`, { capacity: 8, refillPerSec: 0.5 }); }
    catch { rejectUpgrade(socket, 429, 'Too Many Requests'); return true; }
    if ((activeExecByUser.get(userId) ?? 0) >= MAX_CONCURRENT_EXEC) { rejectUpgrade(socket, 429, 'Too Many Streams'); return true; }

    if (!handshake(request, socket, { protocol: auth.protocol })) return true;
    // From the 101 on, not once the attach lands: a client reset while the box starts or the
    // exec is created emitted 'error' with no listener, and the unhandled ECONNRESET took the
    // bridge down with every terminal shell it held (devil C2, 2026-10-14).
    socket.on('error', () => socket.destroy());
    armTokenExpiry(socket, tokenExp);

    let spec;
    try {
      if (isPty) spec = buildShellExecSpec({ safe: isSafe });
      else if (isFsync) spec = buildFsAgentExecSpec();
      else if (isDap) spec = dapExecSpec(url.searchParams.get('lang'));
      else spec = lspExecSpec(url.searchParams.get('lang'));
    } catch { socket.end(closeFrame(4008, isDap ? 'unsupported debug adapter' : 'unsupported language server')); return true; }

    activeExecByUser.set(userId, (activeExecByUser.get(userId) ?? 0) + 1);
    bumpContainerSockets(names.containerName, 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const nextUser = (activeExecByUser.get(userId) ?? 1) - 1;
      if (nextUser <= 0) activeExecByUser.delete(userId); else activeExecByUser.set(userId, nextUser);
      bumpContainerSockets(names.containerName, -1);
    };
    socket.once('close', release); // covers a close during the pending attach
    // http.Server keeps an upgraded socket half-open: a client that went away sends a FIN,
    // the socket emits 'end' and never 'close', and `release` never ran. Six closed tabs and
    // the account got "429 Too Many Streams" on every terminal until a restart (live VM,
    // 2026-10-14: four sockets in CLOSE_WAIT, their docker attach streams still open).
    socket.once('end', () => socket.destroy());
    // Caveat: a client gone without a FIN (sleep, a dropped network) is noticed by TCP
    // keepalive alone: probes start after 30 s idle, but their interval and count are the
    // kernel's (75 s x 9 by default), so its slot comes back after about 11 minutes.
    socket.setKeepAlive(true, 30_000);

    const docker = createDockerClient(env);

    if (isPty) {
      // Bridge-owned session (ADR-002): ensure the sandbox, find-or-spawn the
      // shell, attach this socket as one of its clients. A reload reattaches
      // to the SAME shell and receives the replay ring first.
      const termId = /^\d{1,2}$/.test(url.searchParams.get('term') ?? '') ? url.searchParams.get('term') : '0';
      // A safe terminal is its own session: it must never reattach to the login shell of the same id.
      const sessionKey = `${userId}|${names.containerName}|${termId}${isSafe ? '|safe' : ''}`;
      (async () => {
        await ensureSandbox(env, names);
        return getOrCreateSession({
          key: sessionKey,
          containerName: names.containerName,
          spawn: () => docker.attachExec(names.containerName, spec),
        });
      })().then((session) => {
        // Gone before the attach landed: its 'close' already fired, so a client added now would
        // never be detached. The shell itself stays, as on any detach.
        if (socket.destroyed) return;
        const client = {
          sendBinary: (chunk) => (socket.destroyed ? true : socket.write(encodeFrame(chunk, 2))),
          sendClose: (code, reason) => { if (!socket.destroyed) socket.end(closeFrame(code, reason)); },
          onDrain: (fn) => socket.on('drain', fn),
        };
        attachClient(session, client);
        const decode = createFrameDecoder();
        socket.on('data', (chunk) => {
          let messages;
          try { messages = decode(chunk); } catch { socket.end(closeFrame(4013, 'message too large')); return; }
          for (const m of messages) {
            if (m.opcode === 8) { detachClient(session, client); socket.destroy(); return; } // detach ≠ kill
            if (m.opcode !== 1 && m.opcode !== 2) continue;
            const resize = parseResizeFrame(m.data);
            if (resize) { docker.resizeExec(session.execId, resize.cols, resize.rows); continue; }
            writeStdin(session, m.data);
          }
        });
        socket.on('close', () => detachClient(session, client));
        socket.on('error', () => detachClient(session, client));
      }).catch((error) => {
        release();
        const reason = sandboxRefusal('terminal', names, error, 'sandbox unavailable');
        if (!socket.destroyed) socket.end(closeFrame(4004, reason));
      });
      return true;
    }

    // LSP/DAP/fs-sync may start a stopped box too (never one stopped at the hard cap — see
    // ensureSandbox); a refusal lands in the catch below, which releases the stream cap.
    ensureSandbox(env, names, { passive: true }).then(() => docker.attachExec(names.containerName, spec)).then(({ stream: duplex, execId }) => {
      // Gone before the attach landed: its 'close' handler below would never run, so the attach
      // stayed open and a Tty:false process never saw its stdin end (devil C2, 2026-10-14).
      if (socket.destroyed) { duplex.destroy(); return; }
      const decode = createFrameDecoder();
      // LSP, DAP and fs-sync are Tty:false — strip docker's 8-byte mux headers (see the
      // demux doc). Only the PTY, handled above, is Tty:true and arrives raw.
      const demux = createStdStreamDemux();
      // Backpressure: pause the container stream when the client stops draining,
      // so a slow/zero-window reader can't hoard unbounded bytes in the bridge.
      duplex.on('data', (chunk) => {
        if (socket.destroyed) return;
        let ok = true;
        for (const payload of demux(chunk)) ok = socket.write(encodeFrame(payload, 2)) && ok;
        if (!ok) duplex.pause();
      });
      socket.on('drain', () => duplex.resume());
      duplex.on('close', () => {
        if (socket.destroyed) return;
        if (isLsp) {
          // Inspect the exec to learn the exit code; on failure fall back to 1000.
          docker.inspectExec(execId).then(({ exitCode }) => {
            const { code, reason } = lspCloseFor(exitCode);
            if (!socket.destroyed) socket.end(closeFrame(code, reason));
          }).catch(() => {
            if (!socket.destroyed) socket.end(closeFrame(1000, 'process ended'));
          });
        } else {
          // DAP and fs-sync: close with 1000 'process ended'.
          if (!socket.destroyed) socket.end(closeFrame(1000, 'process ended'));
        }
      });
      duplex.on('error', () => { if (!socket.destroyed) socket.end(closeFrame(1011, 'backend stream error')); });
      socket.on('data', (chunk) => {
        let messages;
        try { messages = decode(chunk); } catch { socket.end(closeFrame(4013, 'message too large')); return; }
        for (const m of messages) {
          if (m.opcode === 8) { duplex.end(); return; } // client close
          if (m.opcode !== 1 && m.opcode !== 2) continue;
          duplex.write(m.data); // LSP/DAP/fsync: per-connection, no resize channel
        }
      });
      socket.on('close', () => duplex.destroy());
      socket.on('error', () => duplex.destroy());
    }).catch((error) => {
      release();
      const kind = isFsync ? 'fs-sync' : (isDap ? 'debug adapter' : 'language server');
      const reason = sandboxRefusal(kind, names, error, 'no running sandbox');
      if (!socket.destroyed) socket.end(closeFrame(4004, reason));
    });
    return true;
  };
}
