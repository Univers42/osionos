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

    let names;
    try {
      const session = verifySession(url.searchParams.get('token'), config);
      const identity = requireSandboxIdentity(session, url.searchParams.get('workspaceId'));
      names = deriveNames(identity.userId, identity.workspaceId);
    } catch { socket.destroy(); return true; }

    if (!handshake(request, socket)) return true;

    let spec;
    try { spec = isPty ? buildShellExecSpec() : lspExecSpec(url.searchParams.get('lang')); }
    catch { socket.write(encodeFrame('unsupported', 1)); socket.destroy(); return true; }

    const docker = createDockerClient(env);
    docker.attachExec(names.containerName, spec).then((duplex) => {
      const decode = createFrameDecoder();
      duplex.on('data', (chunk) => { if (!socket.destroyed) socket.write(encodeFrame(chunk, 2)); });
      duplex.on('close', () => socket.destroyed || socket.end(encodeFrame('', 8)));
      duplex.on('error', () => socket.destroy());
      socket.on('data', (chunk) => {
        let messages;
        try { messages = decode(chunk); } catch { socket.destroy(); return; }
        for (const m of messages) {
          if (m.opcode === 8) { duplex.end(); return; } // client close
          if (m.opcode === 1 || m.opcode === 2) duplex.write(m.data);
        }
      });
      socket.on('close', () => duplex.destroy());
      socket.on('error', () => duplex.destroy());
    }).catch(() => socket.destroy());
    return true;
  };
}
