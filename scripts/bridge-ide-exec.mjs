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

// WS exec-attach relay: the interactive shell (P3, /api/ide/pty) and the LSP
// transport (P5, /api/ide/lsp) — the SAME mechanism, differing only in argv.
// Bridges a browser WebSocket to a hijacked `docker exec` stream on the
// SERVER-derived sandbox container, through the P2 socket-proxy.
//
// Thin glue over tested parts: the WS frame codec (ide-ws, --selfcheck'd), the
// exec engine (ide-docker.runExec, live-tested), and the validated exec specs.
// The pure seams (resize parse, auth extraction, std-stream demux) are unit
// tested in tests/bridge/ide-exec-parse.test.mjs; the docker glue stays
// live-verified. Failures close with a WS code+reason (4001 auth · 4003 gate
// off · 4004 no sandbox · 4008 bad lang · 4013 overflow · 4029 throttled) so
// the frontend can say WHY instead of "[connection closed]".

import { handshake, encodeFrame, closeFrame, createFrameDecoder } from './ide-ws.mjs';
import { createDockerClient } from './ide-docker.mjs';
import { requireSandboxIdentity, deriveNames, buildShellExecSpec, buildFsAgentExecSpec } from './ide-sandbox-spec.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

// Each live exec pins two bridge FDs + a spawned process; cap churn AND
// simultaneous streams per user so one tenant can't exhaust the shared bridge.
const MAX_CONCURRENT_EXEC = 6;
const activeExecByUser = new Map();
// Per-container live-stream counts — the reaper's activity signal, so an
// in-use sandbox is never guillotined by the max-lifetime sweep.
const activeExecByContainer = new Map();

/** Whether any PTY/LSP/fsync stream is currently attached to this container. */
export function hasActiveExec(containerName) {
  return (activeExecByContainer.get(containerName) ?? 0) > 0;
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
 *  so the token stays out of URLs/access logs; the query param remains as a
 *  fallback for one transition. Exported pure for tests. */
export function extractWsAuth(request, url) {
  const offered = String(request.headers['sec-websocket-protocol'] ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const tokenEntry = offered.find((p) => p.startsWith('osio-token.'));
  return {
    token: tokenEntry ? tokenEntry.slice('osio-token.'.length) : url.searchParams.get('token'),
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
const LSP_SERVERS = {
  typescript: ['typescript-language-server', '--stdio'],
  python: ['pyright-langserver', '--stdio'],
  // gopls / rust-analyzer / clangd all speak LSP over stdio with no flag.
  go: ['gopls'],
  rust: ['rust-analyzer'],
  clangd: ['clangd'],
};

function lspExecSpec(lang) {
  const cmd = LSP_SERVERS[lang];
  if (!cmd) throw Object.assign(new Error('unsupported language server'), { status: 400 });
  return { User: '10001:10001', WorkingDir: '/workspace', AttachStdin: true, AttachStdout: true, AttachStderr: true, Cmd: cmd };
}

/** Returns an upgrade handler `(request, socket) => boolean` — true when it owns
 *  the WS path. Attach to the bridge's http server `upgrade` event. `allowOrigin`
 *  is the browser-origin predicate (same allowlist as the REST CORS layer). */
export function createIdeExecUpgradeHandler({ config, verifySession, env = process.env, allowOrigin = () => true }) {
  return function handleIdeExecUpgrade(request, socket) {
    const url = new URL(request.url, 'http://ide.local');
    const isPty = url.pathname === '/api/ide/pty';
    const isLsp = url.pathname === '/api/ide/lsp';
    const isFsync = url.pathname === '/api/ide/fsync';
    if (!isPty && !isLsp && !isFsync) return false;

    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) { rejectUpgrade(socket, 404, 'Not Found'); return true; }
    // Browsers always send Origin on WS upgrades — refuse foreign pages. A
    // missing Origin (non-browser client) still has to pass token auth below.
    const origin = request.headers.origin;
    if (origin && !allowOrigin(origin)) { rejectUpgrade(socket, 403, 'Forbidden'); return true; }

    const auth = extractWsAuth(request, url);
    let userId, names;
    try {
      const session = verifySession(auth.token, config);
      const identity = requireSandboxIdentity(session, url.searchParams.get('workspaceId'));
      userId = identity.userId;
      names = deriveNames(userId, identity.workspaceId);
    } catch { rejectUpgrade(socket, 401, 'Unauthorized'); return true; }

    // Throttle open-churn, then bound simultaneous streams per user.
    try { takeToken(`ide-exec:${userId}`, { capacity: 8, refillPerSec: 0.5 }); }
    catch { rejectUpgrade(socket, 429, 'Too Many Requests'); return true; }
    if ((activeExecByUser.get(userId) ?? 0) >= MAX_CONCURRENT_EXEC) { rejectUpgrade(socket, 429, 'Too Many Streams'); return true; }

    if (!handshake(request, socket, { protocol: auth.protocol })) return true;

    let spec;
    try {
      if (isPty) spec = buildShellExecSpec();
      else if (isFsync) spec = buildFsAgentExecSpec();
      else spec = lspExecSpec(url.searchParams.get('lang'));
    } catch { socket.end(closeFrame(4008, 'unsupported language server')); return true; }

    activeExecByUser.set(userId, (activeExecByUser.get(userId) ?? 0) + 1);
    activeExecByContainer.set(names.containerName, (activeExecByContainer.get(names.containerName) ?? 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const nextUser = (activeExecByUser.get(userId) ?? 1) - 1;
      if (nextUser <= 0) activeExecByUser.delete(userId); else activeExecByUser.set(userId, nextUser);
      const nextBox = (activeExecByContainer.get(names.containerName) ?? 1) - 1;
      if (nextBox <= 0) activeExecByContainer.delete(names.containerName); else activeExecByContainer.set(names.containerName, nextBox);
    };
    socket.once('close', release); // covers a close during the pending attach

    const docker = createDockerClient(env);
    docker.attachExec(names.containerName, spec).then(({ stream: duplex, execId }) => {
      const decode = createFrameDecoder();
      // LSP is Tty:false — strip docker's 8-byte mux headers (see the demux
      // doc). PTY/fsync are Tty:true and arrive raw.
      const demux = isLsp ? createStdStreamDemux() : null;
      // Backpressure: pause the container stream when the client stops draining,
      // so a slow/zero-window reader can't hoard unbounded bytes in the bridge.
      duplex.on('data', (chunk) => {
        if (socket.destroyed) return;
        let ok = true;
        if (demux) { for (const payload of demux(chunk)) ok = socket.write(encodeFrame(payload, 2)) && ok; }
        else ok = socket.write(encodeFrame(chunk, 2));
        if (!ok) duplex.pause();
      });
      socket.on('drain', () => duplex.resume());
      duplex.on('close', () => { if (!socket.destroyed) socket.end(closeFrame(1000, 'process ended')); });
      duplex.on('error', () => { if (!socket.destroyed) socket.end(closeFrame(1011, 'backend stream error')); });
      socket.on('data', (chunk) => {
        let messages;
        try { messages = decode(chunk); } catch { socket.end(closeFrame(4013, 'message too large')); return; }
        for (const m of messages) {
          if (m.opcode === 8) { duplex.end(); return; } // client close
          if (m.opcode !== 1 && m.opcode !== 2) continue;
          // Out-of-band PTY resize — a strict full-frame match, so pasted bytes
          // that merely START with the magic go to stdin like any other input.
          if (isPty) {
            const resize = parseResizeFrame(m.data);
            if (resize) { docker.resizeExec(execId, resize.cols, resize.rows); continue; }
          }
          duplex.write(m.data);
        }
      });
      socket.on('close', () => duplex.destroy());
      socket.on('error', () => duplex.destroy());
    }).catch(() => { release(); if (!socket.destroyed) socket.end(closeFrame(4004, 'no running sandbox')); });
    return true;
  };
}
