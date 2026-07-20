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
// ponytail: no unit test (glue over covered pieces); exercised only against a
// live sandbox. Terminal resize (SIGWINCH) deferred — default geometry works.

import { handshake, encodeFrame, createFrameDecoder } from './ide-ws.mjs';
import { createDockerClient } from './ide-docker.mjs';
import { requireSandboxIdentity, deriveNames, buildShellExecSpec } from './ide-sandbox-spec.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

// Each live exec pins two bridge FDs + a spawned process; cap churn AND
// simultaneous streams per user so one tenant can't exhaust the shared bridge.
const MAX_CONCURRENT_EXEC = 6;
const activeExecByUser = new Map();

// APC-wrapped PTY-resize control frame (see the socket 'data' handler). The
// ESC _ … ESC \ envelope can't be produced by ordinary typing, so it never
// collides with keystrokes bound for stdin.
const RESIZE_MAGIC = Buffer.from('\x1b_osio-resize:');

// The only language servers we relay to (P5). Adding one = one line here + the
// server installed in the sandbox image. Command is server-fixed, never client.
const LSP_SERVERS = {
  typescript: ['typescript-language-server', '--stdio'],
  python: ['pyright-langserver', '--stdio'],
};

function lspExecSpec(lang) {
  const cmd = LSP_SERVERS[lang];
  if (!cmd) throw Object.assign(new Error('unsupported language server'), { status: 400 });
  return { User: '10001:10001', WorkingDir: '/workspace', AttachStdin: true, AttachStdout: true, AttachStderr: true, Cmd: cmd };
}

/** Returns an upgrade handler `(request, socket) => boolean` — true when it owns
 *  the WS path. Attach to the bridge's http server `upgrade` event. */
export function createIdeExecUpgradeHandler({ config, verifySession, env = process.env }) {
  return function handleIdeExecUpgrade(request, socket) {
    const url = new URL(request.url, 'http://ide.local');
    const isPty = url.pathname === '/api/ide/pty';
    const isLsp = url.pathname === '/api/ide/lsp';
    if (!isPty && !isLsp) return false;

    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) { socket.destroy(); return true; }

    let userId, names;
    try {
      const session = verifySession(url.searchParams.get('token'), config);
      const identity = requireSandboxIdentity(session, url.searchParams.get('workspaceId'));
      userId = identity.userId;
      names = deriveNames(userId, identity.workspaceId);
    } catch { socket.destroy(); return true; }

    // Throttle open-churn, then bound simultaneous streams per user.
    try { takeToken(`ide-exec:${userId}`, { capacity: 8, refillPerSec: 0.5 }); }
    catch { socket.destroy(); return true; }
    if ((activeExecByUser.get(userId) ?? 0) >= MAX_CONCURRENT_EXEC) { socket.destroy(); return true; }

    if (!handshake(request, socket)) return true;

    let spec;
    try { spec = isPty ? buildShellExecSpec() : lspExecSpec(url.searchParams.get('lang')); }
    catch { socket.write(encodeFrame('unsupported', 1)); socket.destroy(); return true; }

    activeExecByUser.set(userId, (activeExecByUser.get(userId) ?? 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const next = (activeExecByUser.get(userId) ?? 1) - 1;
      if (next <= 0) activeExecByUser.delete(userId); else activeExecByUser.set(userId, next);
    };
    socket.once('close', release); // covers a close during the pending attach

    const docker = createDockerClient(env);
    docker.attachExec(names.containerName, spec).then(({ stream: duplex, execId }) => {
      const decode = createFrameDecoder();
      // Backpressure: pause the container stream when the client stops draining,
      // so a slow/zero-window reader can't hoard unbounded bytes in the bridge.
      duplex.on('data', (chunk) => {
        if (socket.destroyed) return;
        if (!socket.write(encodeFrame(chunk, 2))) duplex.pause();
      });
      socket.on('drain', () => duplex.resume());
      duplex.on('close', () => { if (!socket.destroyed) socket.end(encodeFrame('', 8)); });
      duplex.on('error', () => socket.destroy());
      socket.on('data', (chunk) => {
        let messages;
        try { messages = decode(chunk); } catch { socket.destroy(); return; }
        for (const m of messages) {
          if (m.opcode === 8) { duplex.end(); return; } // client close
          if (m.opcode !== 1 && m.opcode !== 2) continue;
          // Out-of-band PTY resize (an APC-wrapped control frame the browser
          // sends on fit): `ESC _ osio-resize:COLS,ROWS ESC \`. Kept off stdin so
          // vim/htop and >80-col line editing track the real terminal geometry.
          // ponytail: a paste containing this exact 20-byte magic would trigger a
          // harmless spurious resize — acceptable ceiling.
          if (isPty && m.data.length < 48 && m.data.slice(0, RESIZE_MAGIC.length).equals(RESIZE_MAGIC)) {
            const [c, r] = m.data.slice(RESIZE_MAGIC.length).toString('latin1').replace(/\x1b\\$/, '').split(',');
            docker.resizeExec(execId, c, r);
            continue;
          }
          duplex.write(m.data);
        }
      });
      socket.on('close', () => duplex.destroy());
      socket.on('error', () => duplex.destroy());
    }).catch(() => { release(); socket.destroy(); });
    return true;
  };
}
