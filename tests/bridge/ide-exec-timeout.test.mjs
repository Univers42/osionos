// An exec whose user cannot be resolved can block runc forever (a FIFO behind /etc/passwd,
// docs/adr/0009, devil P9). The daemon then accepts `exec start` and never answers. Each exec kind
// the bridge starts must fail inside the docker timeout and give its stream slot back, never hang.
// The fake daemon below accepts everything up to the start and goes silent there.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createDockerClient, DOCKER_REQUEST_TIMEOUT_MS } from "../../scripts/ide-docker.mjs";
import { createIdeExecUpgradeHandler } from "../../scripts/bridge-ide-exec.mjs";

const USER = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";
const TEST_TIMEOUT_MS = 300;
const FAILS_WITHIN_MS = 3000;

async function silentStartDaemon() {
  const sockets = new Set();
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const path = req.url.split("?")[0];
      const json = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      if (req.method === "GET" && path === "/containers/json") return json(200, []);
      if (req.method === "GET" && path.endsWith("/json") && path.startsWith("/containers/")) return json(200, { State: { Running: true } });
      if (req.method === "POST" && path.endsWith("/exec")) return json(201, { Id: "abc123" });
      // POST /exec/abc123/start: no answer, as a runc init stuck on a FIFO gives none.
    });
  });
  server.on("upgrade", () => {}); // the start comes in as an Upgrade request: also left unanswered
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    host: `127.0.0.1:${server.address().port}`,
    close: () => { for (const socket of sockets) socket.destroy(); return new Promise((resolve) => server.close(resolve)); },
  };
}

const envFor = (host) => ({
  OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: host, OSIONOS_IDE_ALLOWED_SUBJECTS: USER,
  OSIONOS_IDE_DOCKER_TIMEOUT_MS: String(TEST_TIMEOUT_MS),
});

/** Opens a WS path through the real handler; resolves with the close frame it ends on and how long that took. */
function openStream(env, pathAndQuery) {
  const handler = createIdeExecUpgradeHandler({ config: {}, verifySession: () => ({ userId: USER, workspaceIds: [WS] }), env });
  const started = Date.now();
  let settle;
  const ended = new Promise((resolve) => { settle = resolve; });
  const socket = {
    destroyed: false,
    write() { return true; },
    end(chunk) { this.destroyed = true; settle({ chunk, ms: Date.now() - started }); },
    destroy() { this.destroyed = true; settle({ chunk: null, ms: Date.now() - started }); },
    on() {}, once() {}, setKeepAlive() {},
  };
  const request = {
    url: `${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}workspaceId=${WS}`,
    headers: { upgrade: "websocket", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-protocol": "osio-ide.v1, osio-token.t" },
  };
  assert.equal(handler(request, socket), true);
  return ended;
}

const KINDS = [
  ["PTY", "/api/ide/pty"],
  ["language server", "/api/ide/lsp?lang=typescript"],
  ["fs-agent", "/api/ide/fsync"],
];

for (const [kind, path] of KINDS) {
  test(`a ${kind} exec whose start never answers fails inside the docker timeout and frees its slot`, async () => {
    const daemon = await silentStartDaemon();
    try {
      const env = envFor(daemon.host);
      const first = await openStream(env, path);
      assert.ok(first.chunk, "the stream ends with a close frame");
      assert.equal(first.chunk.readUInt16BE(2), 4004);
      assert.ok(first.ms < FAILS_WITHIN_MS, `ended after ${first.ms} ms`);
      // The slot came back: a second open is answered the same way, not with 429 Too Many Streams.
      const second = await openStream(env, path);
      assert.equal(second.chunk.readUInt16BE(2), 4004);
    } finally {
      await daemon.close();
    }
  });
}

test("a git/search exec (runExec) whose start never answers rejects inside the docker timeout", async () => {
  const daemon = await silentStartDaemon();
  try {
    const docker = createDockerClient(envFor(daemon.host));
    const started = Date.now();
    await assert.rejects(docker.runExec("ide-x", { Cmd: ["git", "status"] }), /timeout/);
    assert.ok(Date.now() - started < FAILS_WITHIN_MS);
  } finally {
    await daemon.close();
  }
});

test("the production timeout is 20 s and the override can only lower it", async () => {
  assert.equal(DOCKER_REQUEST_TIMEOUT_MS, 20_000);
  const daemon = await silentStartDaemon();
  try {
    const env = { ...envFor(daemon.host), OSIONOS_IDE_DOCKER_TIMEOUT_MS: "999999" };
    const docker = createDockerClient(env);
    const started = Date.now();
    const pending = docker.runExec("ide-x", { Cmd: ["true"] }).catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.ok(Date.now() - started >= 600); // still waiting: 999999 was clamped to 20 s, not applied
    daemon.close();
    assert.ok(await pending);
  } finally {
    await daemon.close().catch(() => {});
  }
});
