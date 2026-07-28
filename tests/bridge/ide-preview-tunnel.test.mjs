// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-preview-tunnel.test.mjs                        :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// The preview tunnel proven END-TO-END without docker: the EXACT inline agent
// production passes to `node -e` is spawned as a child process against a real
// local HTTP server, driven through the EXACT frame codec the bridge uses.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

import { buildPortTunnelExecSpec } from "../../scripts/ide-sandbox-spec.mjs";
import { encodeTunnelFrame, createTunnelFrameDecoder, createIdePreviewHandler } from "../../scripts/bridge-ide-ops.mjs";

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("frame codec round-trips across arbitrary chunk splits", () => {
  const decode = createTunnelFrameDecoder();
  const wire = Buffer.concat([
    encodeTunnelFrame({ id: 1, path: "/a" }),
    encodeTunnelFrame({ id: 2, path: "/b" }),
  ]);
  const out = [];
  for (let i = 0; i < wire.length; i++) out.push(...decode(wire.subarray(i, i + 1)));
  assert.deepEqual(out.map((m) => m.id), [1, 2]);
});

test("spec builder: port validation + node -e argv shape (never shell)", () => {
  const spec = buildPortTunnelExecSpec(3000);
  assert.equal(spec.Cmd[0], "node");
  assert.equal(spec.Cmd[1], "-e");
  assert.equal(spec.Cmd.at(-1), "3000");
  assert.equal(spec.Tty, undefined); // binary frames must arrive untouched
  assert.equal(spec.AttachStdin, true);
  for (const bad of [0, 70000, 1.5, "80", -1]) {
    assert.throws(() => buildPortTunnelExecSpec(bad), /invalid preview port/);
  }
});

test("the REAL inline agent proxies GET requests to a local server", async () => {
  const { server, port } = await listen((req, res) => {
    if (req.url === "/hello?x=1") {
      res.writeHead(201, { "content-type": "text/plain; charset=utf-8" });
      res.end("hello preview");
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("nope");
    }
  });
  const spec = buildPortTunnelExecSpec(port);
  const agent = spawn(process.execPath, spec.Cmd.slice(1), { stdio: ["pipe", "pipe", "inherit"] });
  const decode = createTunnelFrameDecoder();
  const responses = [];
  const waiters = [];
  agent.stdout.on("data", (chunk) => {
    for (const message of decode(chunk)) {
      responses.push(message);
      waiters.shift()?.();
    }
  });
  const nextResponse = () => (responses.length ? Promise.resolve() : new Promise((r) => waiters.push(r)));

  agent.stdin.write(encodeTunnelFrame({ id: 1, method: "GET", path: "/hello?x=1", headers: { accept: "*/*" } }));
  await nextResponse();
  const ok = responses.shift();
  assert.equal(ok.id, 1);
  assert.equal(ok.status, 201);
  assert.match(ok.headers["content-type"], /text\/plain/);
  assert.equal(Buffer.from(ok.body, "base64").toString(), "hello preview");

  agent.stdin.write(encodeTunnelFrame({ id: 2, method: "GET", path: "/missing", headers: {} }));
  await nextResponse();
  assert.equal(responses.shift().status, 404);

  // A dead upstream answers 502 through the tunnel, never a hang.
  server.close();
  await new Promise((r) => server.on("close", r));
  agent.stdin.write(encodeTunnelFrame({ id: 3, method: "GET", path: "/", headers: {} }));
  await nextResponse();
  assert.equal(responses.shift().status, 502);

  agent.kill();
});

const CONFIG = { allowedOrigin: "https://localhost:3001" };
function fakeRes() {
  return {
    statusCode: 0, headers: null, body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { this.body = String(body ?? ""); },
  };
}

test("preview handler: gate-off 404, cookie-less proxy 401, bad paths 404", async () => {
  const offHandler = createIdePreviewHandler({ config: CONFIG, verifySession: () => ({}), env: {} });
  const off = fakeRes();
  assert.equal(await offHandler(new URL("http://x/api/ide/preview/session"), { method: "POST", headers: {} }, off, CONFIG), true);
  assert.equal(off.statusCode, 404);

  const env = { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "p:2375" };
  const handler = createIdePreviewHandler({
    config: CONFIG,
    verifySession: (token) => { if (!token) throw Object.assign(new Error("no token"), { status: 401 }); return { userId: "u", workspaceIds: [] }; },
    env,
  });
  const unauth = fakeRes();
  const ws = "a1b2c3d4-0001-4000-a000-000000000001";
  assert.equal(await handler(new URL(`http://x/api/ide/preview/${ws}/3000/`), { method: "GET", headers: {} }, unauth, CONFIG), true);
  assert.equal(unauth.statusCode, 401);

  const badPath = fakeRes();
  await handler(new URL("http://x/api/ide/preview/not-a-uuid/3000/"), { method: "GET", headers: {} }, badPath, CONFIG);
  assert.equal(badPath.statusCode, 404);

  const badMethod = fakeRes();
  await handler(new URL(`http://x/api/ide/preview/${ws}/3000/`), { method: "DELETE", headers: {} }, badMethod, CONFIG);
  assert.equal(badMethod.statusCode, 405);
});
