/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-fsync-agent-exit.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every reload left an fs-agent behind: it ran under a TTY, and dockerd closes an exec's
// stdin when its stream closes only without one. Seven agents held ~450 MB of the demo
// box's 1 GiB and `make -j8` failed (2026-10-14). This drives the real upgrade handler
// against a docker API that records the exec it is asked for, answers in docker's
// multiplexed format, and sees the attach connection end when the client leaves: for a
// Tty:false exec that end is the agent's stdin EOF (the agent's own test covers the exit).
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { createIdeExecUpgradeHandler } from "../../scripts/bridge-ide-exec.mjs";

const USER = "55555555-5555-4555-8555-555555555555";
const WS = "66666666-6666-4666-8666-666666666666";
const LINE = '{"event":"ready","path":"","root":"/workspace"}\n';

async function listening(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

function fakeDocker() {
  const seen = { specs: [], attachEnded: false };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.method === "GET" && request.url.endsWith("/json")) {
        response.end(JSON.stringify({ State: { Running: true } }));
      } else if (request.method === "POST" && request.url.endsWith("/exec")) {
        seen.specs.push(JSON.parse(Buffer.concat(chunks).toString()));
        response.statusCode = 201;
        response.end(JSON.stringify({ Id: "exec1" }));
      } else {
        response.statusCode = 404;
        response.end("{}");
      }
    });
  });
  server.on("upgrade", (_request, socket) => {
    socket.write("HTTP/1.1 101 UPGRADED\r\nContent-Type: application/vnd.docker.multiplexed-stream\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n");
    const header = Buffer.alloc(8);
    header[0] = 1; // stdout
    header.writeUInt32BE(Buffer.byteLength(LINE), 4);
    socket.write(Buffer.concat([header, Buffer.from(LINE)]));
    socket.on("end", () => { seen.attachEnded = true; socket.end(); });
    socket.on("close", () => { seen.attachEnded = true; });
    socket.on("error", () => {});
  });
  return { server, seen };
}

/** One fs-sync upgrade; resolves with the client socket and every byte after the 101 header. */
function openFsync(port) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    const received = { bytes: Buffer.alloc(0) };
    let headerDone = false;
    socket.once("error", reject);
    socket.on("data", (chunk) => {
      if (headerDone) { received.bytes = Buffer.concat([received.bytes, chunk]); return; }
      const text = chunk.toString("latin1");
      const end = text.indexOf("\r\n\r\n");
      if (end < 0) return;
      headerDone = true;
      received.status = text.split("\r\n")[0];
      received.bytes = chunk.subarray(end + 4);
      resolve({ socket, received });
    });
    socket.write([
      `GET /api/ide/fsync?workspaceId=${WS} HTTP/1.1`, "Host: localhost", "Connection: Upgrade", "Upgrade: websocket",
      "Sec-WebSocket-Version: 13", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Protocol: osio-ide.v1, osio-token.t", "", "",
    ].join("\r\n"));
  });
}

async function until(check, describe) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`${describe}: not within 3000 ms`);
}

test("the fs-agent runs with stdin and no TTY, its lines arrive demuxed, and a leaving client ends its stdin", async () => {
  const docker = fakeDocker();
  const dockerPort = await listening(docker.server);
  const handler = createIdeExecUpgradeHandler({
    config: {},
    verifySession: () => ({ userId: USER, workspaceIds: [WS] }),
    env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: `127.0.0.1:${dockerPort}`, OSIONOS_IDE_ALLOWED_SUBJECTS: USER },
  });
  const server = createServer();
  server.on("upgrade", (request, socket) => { if (!handler(request, socket)) socket.destroy(); });
  const port = await listening(server);
  let client;
  try {
    const { socket, received } = await openFsync(port);
    client = socket;
    assert.match(received.status, /^HTTP\/1\.1 101 /);
    await until(() => received.bytes.length >= 2 + Buffer.byteLength(LINE), "the agent's line never reached the client");
    assert.equal(received.bytes[0], 0x82, "one binary frame");
    assert.equal(received.bytes.subarray(2).toString(), LINE, "the line without docker's 8-byte header");
    assert.equal(docker.seen.specs.length, 1);
    assert.equal(docker.seen.specs[0].Tty, false);
    assert.equal(docker.seen.specs[0].AttachStdin, true);
    socket.end(); // FIN: a closed tab, a reload
    await until(() => docker.seen.attachEnded, "the docker attach stayed open after the client left");
  } finally {
    client?.destroy();
    server.closeAllConnections();
    docker.server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => docker.server.close(resolve));
  }
});
