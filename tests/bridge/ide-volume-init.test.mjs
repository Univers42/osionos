// The ownership init body is the contract with the socket proxy's ideinit-* shape
// (ide-socket-proxy/init-shape.mjs); the groot parity test pins the two together. This file pins the
// body's own fields and the 120 s bound.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createDockerClient } from "../../scripts/ide-docker.mjs";
import { buildInitSpec, runVolumeInit, initContainerName, HOME_REPAIR, INIT_TIMEOUT_MS } from "../../scripts/ide-volume-init.mjs";

const ARGS = {
  userId: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222",
  image: "osionos-ide-sandbox:latest", uid: 20042, volumeName: "osio-ide-vol-a", homeVolumeName: "osio-ide-home-b",
};

test("init body: root, three caps, no network, read-only, bounded, labeled, real targets, copy-up allowed", () => {
  const spec = buildInitSpec(ARGS);
  assert.equal(spec.User, "0:0");
  assert.deepEqual(spec.Entrypoint, ["/usr/local/sbin/osio-volume-init"]);
  assert.deepEqual(spec.Env, ["OSIO_UID=20042"]);
  assert.equal(spec.Labels["osio.ide.uid"], "20042");
  const hc = spec.HostConfig;
  assert.equal(hc.NetworkMode, "none");
  assert.deepEqual(hc.CapDrop, ["ALL"]);
  assert.deepEqual(hc.CapAdd, ["CHOWN", "DAC_READ_SEARCH", "FOWNER"]);
  assert.equal(hc.ReadonlyRootfs, true);
  assert.ok(hc.PidsLimit <= 16 && hc.Memory <= 128 * 1024 * 1024 && hc.MemorySwap === hc.Memory);
  assert.deepEqual(hc.Mounts.map((m) => [m.Target, m.VolumeOptions]), [["/workspace", undefined], ["/home/coder", undefined]]);
});

test("init name shares the box digest", () => {
  assert.equal(initContainerName("a".repeat(32)), `ideinit-${"a".repeat(32)}`);
});

function recorder({ exit = 0, waitError = null } = {}) {
  const calls = [];
  return {
    calls,
    async remove(n) { calls.push(["remove", n]); },
    async create(n) { calls.push(["create", n]); },
    async start(n) { calls.push(["start", n]); },
    async waitStopped(n, ms) { calls.push(["wait", n, ms]); if (waitError) throw waitError; return exit; },
  };
}
const NAMES = { ...ARGS, digest: "a".repeat(32) };

test("the init waits at most 120 s and is removed after success", async () => {
  const docker = recorder();
  await runVolumeInit(docker, NAMES, ARGS);
  assert.equal(INIT_TIMEOUT_MS, 120_000);
  assert.deepEqual(docker.calls.find((c) => c[0] === "wait"), ["wait", `ideinit-${"a".repeat(32)}`, 120_000]);
  assert.equal(docker.calls.at(-1)[0], "remove");
});

test("a timeout, a non-zero exit and a failed create each raise HOME_REPAIR and still remove the init", async () => {
  for (const docker of [recorder({ waitError: new Error("docker request timeout") }), recorder({ exit: 1 })]) {
    await assert.rejects(runVolumeInit(docker, NAMES, ARGS), (e) => e.code === HOME_REPAIR && e.status === 503);
    assert.equal(docker.calls.at(-1)[0], "remove");
  }
  const failing = recorder();
  failing.create = async () => { throw new Error("create failed (403)"); };
  await assert.rejects(runVolumeInit(failing, NAMES, ARGS), (e) => e.code === HOME_REPAIR);
});

test("listManaged hides init containers, so the reaper and the box cap never count them", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ Names: ["/ide-a"], State: "running" }, { Names: ["/ideinit-a"], State: "running" }]));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const docker = createDockerClient({ OSIONOS_IDE_DOCKER_HOST: `127.0.0.1:${server.address().port}` });
    assert.deepEqual((await docker.listManaged()).map((c) => c.Names[0]), ["/ide-a"]);
  } finally {
    server.close();
  }
});

test("waitStopped returns the exit code and gives up after its own bound", async () => {
  const server = createServer((req, res) => {
    if (req.url.includes("ide-slow")) return; // never answers
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ StatusCode: 7 }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const docker = createDockerClient({ OSIONOS_IDE_DOCKER_HOST: `127.0.0.1:${server.address().port}` });
    assert.equal(await docker.waitStopped("ideinit-a", 1000), 7);
    await assert.rejects(docker.waitStopped("ide-slow", 100), /timeout/);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
