// B3.3: with OSIONOS_IDE_VOLUME_QUOTA=on the bridge asks for exactly {"size":"2G"} on the home volume
// and {"size":"5G"} on the workspace volume; off (the default) the create body is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createDockerClient, volumeDriverOpts } from "../../scripts/ide-docker.mjs";

const HEX = "a".repeat(32);

test("volumeDriverOpts: literals per prefix when on, nothing when off or unknown", () => {
  const on = { OSIONOS_IDE_VOLUME_QUOTA: "on" };
  assert.deepEqual(volumeDriverOpts(`osio-ide-home-${HEX}`, on), { size: "2G" });
  assert.deepEqual(volumeDriverOpts(`osio-ide-vol-${HEX}`, on), { size: "5G" });
  assert.equal(volumeDriverOpts("something-else", on), undefined);
  for (const off of [{}, { OSIONOS_IDE_VOLUME_QUOTA: "off" }, { OSIONOS_IDE_VOLUME_QUOTA: "1" }, { OSIONOS_IDE_VOLUME_QUOTA: "ON" }]) {
    assert.equal(volumeDriverOpts(`osio-ide-home-${HEX}`, off), undefined, JSON.stringify(off));
  }
});

async function createdBodies(env) {
  const bodies = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => { bodies.push(JSON.parse(raw)); res.writeHead(201, { "content-type": "application/json" }); res.end("{}"); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const docker = createDockerClient({ ...env, OSIONOS_IDE_DOCKER_HOST: `127.0.0.1:${server.address().port}` });
    await docker.ensureVolume(`osio-ide-vol-${HEX}`);
    await docker.ensureVolume(`osio-ide-home-${HEX}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
  return bodies;
}

test("ensureVolume sends the DriverOpts only when the flag is on", async () => {
  const on = await createdBodies({ OSIONOS_IDE_VOLUME_QUOTA: "on" });
  assert.deepEqual(on.map((b) => b.DriverOpts), [{ size: "5G" }, { size: "2G" }]);
  const off = await createdBodies({});
  assert.deepEqual(off.map((b) => "DriverOpts" in b), [false, false]);
  assert.deepEqual(off[0], { Name: `osio-ide-vol-${HEX}`, Driver: "local", Labels: { "osio.ide.managed": "1" } });
});
