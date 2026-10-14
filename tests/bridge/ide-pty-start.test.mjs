/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-pty-start.test.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The terminal relay handed ensureSandbox deriveNames() alone (no owner/workspace ids), so a
// terminal on a stopped or absent box sent a create without its labels, the socket-proxy refused
// it ("create rejected: Labels") and the user read "sandbox unavailable" (2026-10-14, reproduced
// inside the VM ide-server); a full box cap read the same, with nothing logged. These drive the
// real upgrade handler into a fake docker API and check what reaches it and what the user is told.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createIdeExecUpgradeHandler } from "../../scripts/bridge-ide-exec.mjs";

const USER = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";

async function fakeDocker({ running = [] } = {}) {
  const creates = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const send = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      const path = req.url.split("?")[0];
      if (req.method === "GET" && path === "/containers/json") return send(200, running.map((name) => ({ Names: [`/${name}`], State: "running" })));
      if (req.method === "GET" && path.endsWith("/json")) return send(404, { message: "No such container" });
      if (req.method === "POST" && path === "/volumes/create") return send(201, {});
      if (req.method === "POST" && path === "/containers/create") { creates.push(JSON.parse(raw)); return send(201, { Id: "c1" }); }
      if (req.method === "POST" && path.endsWith("/start")) return send(204);
      return send(500, { message: "not faked" }); // the shell exec: ends the attach
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { creates, host: `127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Opens /api/ide/pty through the real handler; resolves with the close frame the relay ends on. */
function openTerminal(dockerHost) {
  const handler = createIdeExecUpgradeHandler({
    config: {},
    verifySession: () => ({ userId: USER, workspaceIds: [WS] }),
    env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: dockerHost, OSIONOS_IDE_ALLOWED_SUBJECTS: USER },
  });
  let settle;
  const ended = new Promise((resolve) => { settle = resolve; });
  const socket = {
    destroyed: false,
    write() { return true; },
    end(chunk) { this.destroyed = true; settle(chunk); },
    destroy() { this.destroyed = true; settle(null); },
    on() {},
    once() {},
  };
  const request = {
    url: `/api/ide/pty?workspaceId=${WS}`,
    headers: { upgrade: "websocket", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-protocol": "osio-ide.v1, osio-token.t" },
  };
  assert.equal(handler(request, socket), true);
  return ended;
}

// A close frame under 126 bytes: 0x88, the length, a 2-byte code, then the reason.
const closeOf = (frame) => ({ code: frame.readUInt16BE(2), reason: frame.subarray(4).toString() });

test("a terminal on an absent box creates it with its owner and workspace labels", async () => {
  const docker = await fakeDocker();
  try {
    await openTerminal(docker.host);
    assert.equal(docker.creates.length, 1);
    const labels = docker.creates[0].Labels;
    assert.equal(labels["osio.ide.owner"], USER);
    assert.equal(labels["osio.ide.workspace"], WS);
  } finally {
    await docker.close();
  }
});

test("a terminal refused at the box cap is told so, not 'sandbox unavailable'", async () => {
  const docker = await fakeDocker({ running: ["ide-a", "ide-b"] }); // the default cap is 2
  try {
    const frame = await openTerminal(docker.host);
    assert.deepEqual(closeOf(frame), { code: 4004, reason: "All IDE sandboxes are in use; try again in a few minutes." });
    assert.equal(docker.creates.length, 0);
  } finally {
    await docker.close();
  }
});
