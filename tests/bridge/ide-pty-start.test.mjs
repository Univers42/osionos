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
  const inits = [];
  const volumes = [];
  const execs = [];
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
      if (req.method === "POST" && path === "/volumes/create") { volumes.push(JSON.parse(raw)); return send(201, {}); }
      if (req.method === "POST" && path === "/osio/v1/uid") return send(200, { uid: 20000 });
      if (req.method === "POST" && path === "/containers/create") {
        (req.url.includes("name=ideinit-") ? inits : creates).push(JSON.parse(raw));
        return send(201, { Id: "c1" });
      }
      if (req.method === "POST" && path.endsWith("/wait")) return send(200, { StatusCode: 0 });
      if (req.method === "DELETE") return send(204);
      if (req.method === "POST" && path.endsWith("/start")) return send(204);
      if (req.method === "POST" && path.endsWith("/exec")) execs.push(JSON.parse(raw));
      return send(500, { message: "not faked" }); // the shell exec: ends the attach
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { creates, inits, volumes, execs, host: `127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Opens /api/ide/pty through the real handler; resolves with the close frame the relay ends on. */
function openTerminal(dockerHost, query = "") {
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
    setKeepAlive() {},
  };
  const request = {
    url: `/api/ide/pty?workspaceId=${WS}${query}`,
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
    assert.equal(labels["osio.ide.uid"], "20000");
    assert.equal(docker.creates[0].User, "20000:10001");
    assert.equal(docker.inits.length, 1, "the ownership init runs before the create");
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

test("a terminal on an absent box creates the workspace volume and the per-user home volume (H1, H2)", async () => {
  const docker = await fakeDocker();
  try {
    await openTerminal(docker.host);
    const { deriveNames, deriveHomeVolume } = await import("../../scripts/ide-sandbox-spec.mjs");
    const names = deriveNames(USER, WS);
    assert.deepEqual(docker.volumes, [
      { Name: names.volumeName, Driver: "local", Labels: { "osio.ide.managed": "1" } },
      { Name: deriveHomeVolume(USER), Driver: "local", Labels: { "osio.ide.managed": "1" } },
    ]);
    assert.ok(docker.creates[0].HostConfig.Mounts.every((m) => m.VolumeOptions?.NoCopy === true));
    assert.deepEqual(docker.creates[0].HostConfig.Mounts.map((m) => m.Target), ["/workspace", "/home/coder"]);
    assert.deepEqual(Object.keys(docker.creates[0].HostConfig.Tmpfs), ["/tmp"]);
  } finally {
    await docker.close();
  }
});

test("the terminal runs the login launcher; safe=1 runs bash without profile or rc (H4, L4)", async () => {
  const docker = await fakeDocker();
  try {
    await openTerminal(docker.host);
    await openTerminal(docker.host, "&safe=1");
    assert.deepEqual(docker.execs.map((e) => e.Cmd), [["/usr/local/bin/osio-login"], ["/bin/bash", "--noprofile", "--norc"]]);
  } finally {
    await docker.close();
  }
});
