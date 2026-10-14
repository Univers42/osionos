/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-ws-half-close.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// http.Server keeps an upgraded socket half-open, so a client that went away (a
// closed tab, a killed browser) left its socket in CLOSE_WAIT: 'end' fired, 'close'
// never did, and the stream slot was never released. After six, every terminal,
// fs-sync and language server of that account got "429 Too Many Streams" until the
// ide-server restarted (live VM, 2026-10-14). This drives the real upgrade handler
// behind a real http.Server, over real TCP, against a docker API that never answers.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { createIdeExecUpgradeHandler } from "../../scripts/bridge-ide-exec.mjs";

const USER = "33333333-3333-4333-8333-333333333333";
const WS = "44444444-4444-4444-8444-444444444444";

async function listening(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

/** One fs-sync upgrade; resolves with the status line and the client socket. */
function upgrade(port) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("error", reject);
    socket.once("data", (chunk) => resolve({ status: chunk.toString().split("\r\n")[0], socket }));
    socket.write([
      `GET /api/ide/fsync?workspaceId=${WS} HTTP/1.1`, "Host: localhost", "Connection: Upgrade", "Upgrade: websocket",
      "Sec-WebSocket-Version: 13", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Protocol: osio-ide.v1, osio-token.t", "", "",
    ].join("\r\n"));
  });
}

test("a client that half-closes its socket gives its stream slot back", async () => {
  const docker = createServer(() => {}); // accepts, never answers: the attach stays pending
  const dockerPort = await listening(docker);
  const handler = createIdeExecUpgradeHandler({
    config: {},
    verifySession: () => ({ userId: USER, workspaceIds: [WS] }),
    env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: `127.0.0.1:${dockerPort}`, OSIONOS_IDE_ALLOWED_SUBJECTS: USER },
  });
  const server = createServer();
  server.on("upgrade", (request, socket) => { if (!handler(request, socket)) socket.destroy(); });
  const port = await listening(server);
  const clients = [];
  try {
    // Seven opens, under the open-churn bucket (8), past the stream cap (6).
    for (let i = 0; i < 7; i += 1) {
      const { status, socket } = await upgrade(port);
      clients.push(socket);
      assert.match(status, /^HTTP\/1\.1 101 /, `open ${i + 1}: ${status}`);
      socket.end(); // FIN, no close frame: what a killed browser's port forward sends
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    for (const socket of clients) socket.destroy();
    server.closeAllConnections();
    docker.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => docker.close(resolve));
  }
});
