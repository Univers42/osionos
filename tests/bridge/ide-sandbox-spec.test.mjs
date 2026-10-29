// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-sandbox-spec.test.mjs                          :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";

import {
  requireSandboxIdentity, requireIdeSubject, deriveNames, deriveHomeVolume, buildContainerSpec, buildGitExecSpec, buildShellExecSpec,
  buildSearchExecSpec, buildWriteExecSpec, buildFsOpSpec, buildPortTunnelExecSpec, buildFsAgentExecSpec, SANDBOX_OOM_SCORE_ADJ,
} from "../../scripts/ide-sandbox-spec.mjs";

const U = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";
const session = { userId: U, workspaceIds: [W] };
const env = { OSIONOS_IDE_ALLOWED_SUBJECTS: U };

test("identity: owner from session, workspace ownership-checked (devil #11)", () => {
  assert.deepEqual(requireSandboxIdentity(session, W, env), { userId: U, workspaceId: W });
  assert.throws(() => requireSandboxIdentity(session, "33333333-3333-4333-8333-333333333333", env), /No access/);
  assert.throws(() => requireSandboxIdentity({ userId: "not-a-uuid", workspaceIds: [W] }, W, env), /session subject/);
  assert.throws(() => requireSandboxIdentity(session, "../../etc", env), /workspace id/);
  assert.throws(() => requireSandboxIdentity(session, "mini-baas-postgres", env), /workspace id/);
});

test("names: hashed, regex-safe, carry no raw id (devil #11)", () => {
  const a = deriveNames(U, W);
  assert.match(a.containerName, /^ide-[0-9a-f]{32}$/);
  assert.match(a.volumeName, /^osio-ide-vol-[0-9a-f]{32}$/);
  assert.ok(!a.containerName.includes(U) && !a.containerName.includes(W));
  assert.deepEqual(deriveNames(U, W), a); // stable
  assert.notEqual(deriveNames(U, "44444444-4444-4444-4444-444444444444").digest, a.digest);
});

test("container spec: hardening baked, no user params, no PAT (devil #8,#14)", () => {
  const { volumeName } = deriveNames(U, W);
  const spec = buildContainerSpec({ userId: U, workspaceId: W, image: "sha256:pinned", sandboxNet: "sandbox-net", volumeName, uid: 20007 });
  assert.deepEqual(spec.HostConfig.CapDrop, ["ALL"]);
  assert.ok(spec.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.equal(spec.HostConfig.ReadonlyRootfs, true);
  assert.equal(spec.User, "20007:10001");
  assert.equal(spec.Labels["osio.ide.uid"], "20007");
  assert.equal(spec.HostConfig.NetworkMode, "sandbox-net");
  // exactly two mounts, fixed order [workspace, home], both derived volumes; no host binds (H1).
  assert.deepEqual(spec.HostConfig.Mounts, [
    { Type: "volume", Source: volumeName, Target: "/workspace", VolumeOptions: { NoCopy: true } },
    { Type: "volume", Source: deriveHomeVolume(U), Target: "/home/coder", VolumeOptions: { NoCopy: true } },
  ]);
  assert.deepEqual(Object.keys(spec.HostConfig.Tmpfs), ["/tmp"]);
  assert.equal(spec.HostConfig.Tmpfs["/tmp"], "size=64m,mode=1777,exec");
  assert.equal(spec.HostConfig.Binds, undefined);
  assert.equal(spec.HostConfig.Privileged, undefined);
  // core dumps off; caps present.
  assert.ok(spec.HostConfig.Ulimits.some((u) => u.Name === "core" && u.Hard === 0));
  // the kernel's first OOM choice is a box, never the databases sharing the host.
  assert.equal(SANDBOX_OOM_SCORE_ADJ, 500);
  assert.equal(spec.HostConfig.OomScoreAdj, 500);
  // block quota is opt-in (xfs+pquota only) — omitted by default, applied when asked.
  assert.equal(spec.HostConfig.StorageOpt, undefined);
  const quota = buildContainerSpec({ userId: U, workspaceId: W, image: "x", sandboxNet: "n", volumeName, uid: 20007, diskSize: "2G" });
  assert.equal(quota.HostConfig.StorageOpt.size, "2G");
  assert.ok(spec.HostConfig.PidsLimit > 0 && spec.HostConfig.Memory > 0 && spec.HostConfig.NanoCpus > 0);
  // NO GIT_PAT in the long-lived container env (condition 13).
  assert.ok(!spec.Env.some((e) => e.startsWith("GIT_PAT")));
  assert.ok(spec.Env.some((e) => e === "HTTPS_PROXY=http://ide-egress:8080"));
});

test("git exec: fixed argv, PAT only here — never the shell (devil #9,#13)", () => {
  const spec = buildGitExecSpec(["git", "push", "origin", "main"], "ghp_secret");
  assert.deepEqual(spec.Cmd, ["git", "push", "origin", "main"]);
  assert.deepEqual(spec.Env, ["GIT_PAT=ghp_secret"]);
  assert.equal("User" in spec, false);
  assert.throws(() => buildGitExecSpec(["rm", "-rf", "/"], "x"), /argv must start with git/);
  // the interactive shell spec carries no secret at all.
  const shell = buildShellExecSpec();
  assert.deepEqual(shell.Cmd, ["/usr/local/bin/osio-login"]);
  assert.ok(!shell.Env.some((e) => e.startsWith("GIT_PAT")));
});

test("home volume: per user, hashed, constant target, no username (H1, H2)", () => {
  const home = deriveHomeVolume(U);
  assert.match(home, /^osio-ide-home-[0-9a-f]{32}$/);
  assert.ok(!home.includes(U));
  assert.equal(deriveHomeVolume(U), home);
  assert.notEqual(deriveHomeVolume("44444444-4444-4444-8444-444444444444"), home);
  // one home across workspaces: the workspace never enters the derivation.
  const a = buildContainerSpec({ userId: U, workspaceId: W, image: "x", sandboxNet: "n", volumeName: deriveNames(U, W).volumeName, uid: 20000 });
  const otherWs = "44444444-4444-4444-4444-444444444444";
  const b = buildContainerSpec({ userId: U, workspaceId: otherWs, image: "x", sandboxNet: "n", volumeName: deriveNames(U, otherWs).volumeName, uid: 20000 });
  assert.equal(a.HostConfig.Mounts[1].Source, b.HostConfig.Mounts[1].Source);
  assert.notEqual(a.HostConfig.Mounts[0].Source, b.HostConfig.Mounts[0].Source);
});

test("safe shell: fixed rc-free argv, never the launcher; only safe === true selects it (H4)", () => {
  assert.deepEqual(buildShellExecSpec({ safe: true }).Cmd, ["/bin/bash", "--noprofile", "--norc"]);
  for (const notSafe of [undefined, false, "1", 1, "true"]) {
    assert.deepEqual(buildShellExecSpec({ safe: notSafe }).Cmd, ["/usr/local/bin/osio-login"]);
  }
  assert.ok(!buildShellExecSpec({ safe: true }).Env.some((e) => e.startsWith("GIT_PAT")));
});

test("git subcommand allowlist blocks config (PAT-persist defeat) + junk", () => {
  assert.ok(buildGitExecSpec(["git", "status", "--porcelain"]).Tty);
  assert.deepEqual(buildGitExecSpec(["git", "push", "origin", "main"], "p").Env, ["GIT_PAT=p"]);
  // `git config credential.helper store` would defeat condition 13 — denied.
  assert.throws(() => buildGitExecSpec(["git", "config", "credential.helper", "store"]), /not allowed/);
  assert.throws(() => buildGitExecSpec(["git", "gc"]), /not allowed/);
  assert.throws(() => buildGitExecSpec(["git"]), /subcommand/);
});

test("search argv: query is an argv item after `--` (no flag injection)", () => {
  const spec = buildSearchExecSpec("-x; rm -rf", 50);
  // the query sits after `--`, so ripgrep treats a leading `-` as a literal.
  const dashDash = spec.Cmd.indexOf("--");
  assert.ok(dashDash !== -1 && spec.Cmd[dashDash + 1] === "-x; rm -rf");
  assert.throws(() => buildSearchExecSpec(""), /invalid search/);
  assert.throws(() => buildSearchExecSpec("x".repeat(600)), /invalid search/);
});

test("write path: no traversal, no absolute; path + content are argv items", () => {
  const spec = buildWriteExecSpec("src/main.py", "cHJpbnQoMSk=");
  assert.equal(spec.Cmd[4], "src/main.py");
  assert.equal(spec.Cmd[5], "cHJpbnQoMSk=");
  // The rejection CONTRACT (traversal/absolute/empty → status-400 throw) is
  // the assertion; the message wording consolidated into assertRelPath.
  assert.throws(() => buildWriteExecSpec("../etc/passwd"), /invalid.*path/);
  assert.throws(() => buildWriteExecSpec("/etc/passwd"), /invalid.*path/);
  assert.throws(() => buildWriteExecSpec(""), /invalid.*path/);
});

test("container spec: the uid is required and range-checked; no exec builder carries a User (A2.1, A2.2)", () => {
  const volumeName = deriveNames(U, W).volumeName;
  const base = { userId: U, workspaceId: W, image: "x", sandboxNet: "n", volumeName };
  for (const bad of [undefined, 10001, 19999, 60000, "20000", 20000.5]) {
    assert.throws(() => buildContainerSpec({ ...base, uid: bad }), /uid/, String(bad));
  }
  assert.equal(buildContainerSpec({ ...base, uid: 59999 }).User, "59999:10001");
  const execs = [
    buildGitExecSpec(["git", "status"], ""), buildSearchExecSpec("x"), buildFsOpSpec("stat", { path: "" }),
    buildPortTunnelExecSpec(3000), buildShellExecSpec(), buildFsAgentExecSpec(),
  ];
  for (const spec of execs) assert.equal("User" in spec, false);
});

test("no IDE script hard-codes a numeric User (the LSP and DAP exec specs are not exported)", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["bridge-ide-exec.mjs", "bridge-ide-ops.mjs", "bridge-ide-sandbox.mjs", "ide-sandbox-spec.mjs"]) {
    const text = await readFile(new URL(`../../scripts/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\bUser:\s*["'][0-9]/, file);
  }
});

// ---- buildKeySyncSpec (P5-3-c): ~/.ssh/allowed_signers is REPLACED from the account's public keys ----
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buildKeySyncSpec, MAX_SYNC_KEYS } from "../../scripts/ide-sandbox-spec.mjs";
import { createIdeSandboxHandler } from "../../scripts/bridge-ide-sandbox.mjs";
import { createIdeOpsHandler } from "../../scripts/bridge-ide-ops.mjs";
import { SSH_KEYS } from "./support/key-fixtures.mjs";

const keyItem = (key) => ({ type: key.type, blob: key.blob });
const [K1, K2] = [SSH_KEYS.ed25519, SSH_KEYS.ecdsa256];
// The proxy's exec shape (create-shape.mjs execShapeViolation): these keys only, WorkingDir pinned.
const EXEC_KEYS = ["Cmd", "WorkingDir", "AttachStdin", "AttachStdout", "AttachStderr", "Tty", "Env"];

/** Runs a spec the way the box would, with /home/coder pointed at a scratch dir; the file is then read back
 *  through the real fs-op read script, not by peeking at the spec. */
function runInScratchHome(home, spec) {
  const [sh, flag, script, ...rest] = spec.Cmd;
  return spawnSync(sh, [flag, script.replaceAll("/home/coder", home), ...rest], { cwd: home, encoding: "utf8" });
}
function readBack(home, rel) {
  const read = buildFsOpSpec("read", { path: rel });
  const out = spawnSync("sh", ["-c", read.Cmd[2], ...read.Cmd.slice(3), rel, "0", "100000"], { cwd: home, encoding: "utf8" });
  return Buffer.from(out.stdout, "base64").toString("utf8");
}
function withHome(run) {
  const home = mkdtempSync(join(tmpdir(), "osio-keysync-"));
  try { run(home); } finally { rmSync(home, { recursive: true, force: true }); }
}

test("key sync: Cmd is a constant script, keys ride argv only, and the shape passes the proxy rules", () => {
  const a = buildKeySyncSpec([keyItem(K1)]);
  const b = buildKeySyncSpec([keyItem(K1), keyItem(K2)]);
  assert.deepEqual(a.Cmd.slice(0, 4), b.Cmd.slice(0, 4));
  assert.equal(a.Cmd.length, 5);
  assert.equal(b.Cmd.length, 6);
  assert.ok(!JSON.stringify(a.Cmd.slice(0, 4)).includes(K1.blob));
  assert.equal(a.WorkingDir, "/workspace");
  assert.ok(Object.keys(a).every((key) => EXEC_KEYS.includes(key)));
  assert.equal("User" in a, false);
  assert.ok(a.Cmd.every((part) => typeof part === "string"));
});

test("key sync: lines are `* type blob`, comment-free, sorted by fingerprint, deduplicated", () => {
  const decoded = (spec) => spec.Cmd.slice(4).map((arg) => Buffer.from(arg, "base64").toString());
  const lines = decoded(buildKeySyncSpec([keyItem(K1), keyItem(K2), keyItem(K1)]));
  const sorted = [K1, K2].sort((x, y) => (x.fingerprint < y.fingerprint ? -1 : 1)).map((k) => `* ${k.type} ${k.blob}`);
  assert.deepEqual(lines, sorted);
  assert.deepEqual(decoded(buildKeySyncSpec([keyItem(K2), keyItem(K1)])), sorted);
});

test("key sync: sync [k1,k2] then [k1] leaves exactly k1; an empty list empties the file; two runs give the same bytes", () => {
  withHome((home) => {
    const both = runInScratchHome(home, buildKeySyncSpec([keyItem(K1), keyItem(K2)]));
    assert.equal(both.status, 0, both.stderr);
    assert.equal(readBack(home, ".ssh/allowed_signers").trim().split("\n").length, 2);
    assert.equal(runInScratchHome(home, buildKeySyncSpec([keyItem(K1)])).status, 0);
    const once = readBack(home, ".ssh/allowed_signers");
    assert.equal(once, `* ${K1.type} ${K1.blob}\n`);
    runInScratchHome(home, buildKeySyncSpec([keyItem(K1)]));
    assert.equal(readBack(home, ".ssh/allowed_signers"), once);
    assert.equal(runInScratchHome(home, buildKeySyncSpec([])).status, 0);
    assert.equal(readBack(home, ".ssh/allowed_signers"), "");
    assert.equal(statSync(join(home, ".ssh")).mode & 0o777, 0o700);
    assert.equal(statSync(join(home, ".ssh/allowed_signers")).mode & 0o777, 0o600);
  });
});

test("key sync: nothing but the file is left behind (no temp file)", () => {
  withHome((home) => {
    runInScratchHome(home, buildKeySyncSpec([keyItem(K1)]));
    const listing = spawnSync("sh", ["-c", "ls -A .ssh"], { cwd: home, encoding: "utf8" }).stdout.trim();
    assert.equal(listing, "allowed_signers");
    assert.equal(readFileSync(join(home, ".ssh/allowed_signers"), "utf8").includes("evil"), false);
  });
});

test("key sync: a trailing comment on a blob is dropped from the emitted line, not carried", () => {
  const spec = buildKeySyncSpec([{ type: K1.type, blob: `${K1.blob} evil` }]);
  assert.equal(Buffer.from(spec.Cmd[4], "base64").toString(), `* ${K1.type} ${K1.blob}`);
});

test("key sync: hostile items are refused before any spec exists", () => {
  const hostile = [
    { type: K1.type, blob: `${K1.blob};id` },
    { type: K1.type, blob: `$(id)${K1.blob}` },
    { type: K1.type, blob: `\`id\`` },
    { type: K1.type, blob: `${K1.blob}\ncommand="x" ${K1.type} ${K1.blob}` },
    { type: `command="x" ${K1.type}`, blob: K1.blob },
    { type: "ssh-ed25519", blob: SSH_KEYS.ecdsa256.blob },
    { type: undefined, blob: undefined },
    null,
  ];
  for (const item of hostile) assert.throws(() => buildKeySyncSpec([item]), { status: 400 }, JSON.stringify(item));
  assert.throws(() => buildKeySyncSpec("nope"), { status: 400 });
  assert.throws(() => buildKeySyncSpec(new Array(MAX_SYNC_KEYS + 1).fill(keyItem(K1))), { status: 400 });
  assert.doesNotThrow(() => buildKeySyncSpec(new Array(MAX_SYNC_KEYS).fill(keyItem(K1))));
});

const SYNC_ENV = { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375", OSIONOS_IDE_ALLOWED_SUBJECTS: U };
const SYNC_CONFIG = { allowedOrigin: "https://localhost:3001" };
function sessionReply({ keys, runExec }) {
  const calls = [];
  const handler = createIdeSandboxHandler({
    config: SYNC_CONFIG, env: SYNC_ENV,
    verifySession: () => ({ userId: U, workspaceIds: [W] }),
    ensure: async () => ({ status: "running", reused: true }),
    createDocker: () => ({ runExec: async (name, spec) => { calls.push(spec); return runExec(); } }),
  });
  const request = Object.assign(Readable.from([JSON.stringify({ workspaceId: W, ...(keys === undefined ? {} : { keys }) })]), { method: "POST", headers: { authorization: "Bearer t" } });
  const response = { statusCode: 0, body: null, writeHead(status) { this.statusCode = status; }, end(text) { this.body = JSON.parse(text); } };
  return handler(new URL("http://x/api/ide/session"), request, response, SYNC_CONFIG).then(() => ({ response, calls }));
}

test("session: a key sync that rejects, fails or is refused never fails the session; it answers keys:stale", async () => {
  const cases = [
    ["rejects", [keyItem(K1)], async () => { throw new Error("docker down"); }],
    ["exits non-zero", [keyItem(K1)], async () => ({ exitCode: 1, output: "" })],
    ["is refused by the validator", [{ type: K1.type, blob: "a;b" }], async () => ({ exitCode: 0, output: "" })],
  ];
  for (const [label, keys, runExec] of cases) {
    const { response } = await sessionReply({ keys, runExec });
    assert.equal(response.statusCode, 200, label);
    assert.equal(response.body.ok, true, label);
    assert.equal(response.body.keys, "stale", label);
    assert.equal(response.body.status, "running", label);
  }
});

test("session: a good sync adds nothing to the reply, and a request with no keys never touches docker for them", async () => {
  const good = await sessionReply({ keys: [keyItem(K1)], runExec: async () => ({ exitCode: 0, output: "" }) });
  assert.equal(good.response.statusCode, 200);
  assert.equal("keys" in good.response.body, false);
  assert.equal(good.calls.length, 1);
  const none = await sessionReply({ keys: undefined, runExec: async () => { throw new Error("must not run"); } });
  assert.equal(none.response.statusCode, 200);
  assert.equal(none.calls.length, 0);
});

test("ops: /api/ide/keys/sync is a route of the plane, gated like the others", async () => {
  const handler = createIdeOpsHandler({ config: SYNC_CONFIG, env: SYNC_ENV, verifySession: () => ({ userId: U, workspaceIds: [W] }) });
  const answer = async (method, env = SYNC_ENV) => {
    const h = createIdeOpsHandler({ config: SYNC_CONFIG, env, verifySession: () => ({ userId: U, workspaceIds: [W] }) });
    const response = { statusCode: 0, writeHead(status) { this.statusCode = status; }, end() {} };
    const handled = await h(new URL("http://x/api/ide/keys/sync"), { method, headers: {} }, response, SYNC_CONFIG);
    return { handled, status: response.statusCode };
  };
  assert.equal(typeof handler, "function");
  assert.deepEqual(await answer("POST", {}), { handled: true, status: 404 });
  assert.deepEqual(await answer("GET"), { handled: true, status: 405 });
});

test("git log with a signature field trusts only the synced allowed_signers; every other git exec is unchanged", () => {
  const signed = buildGitExecSpec(["git", "log", "--format=%G?%x09%h", "-n", "10"], "");
  assert.deepEqual(signed.Env, ["GIT_CONFIG_COUNT=1", "GIT_CONFIG_KEY_0=gpg.ssh.allowedSignersFile", "GIT_CONFIG_VALUE_0=/home/coder/.ssh/allowed_signers"]);
  assert.deepEqual(buildGitExecSpec(["git", "log", "--oneline"], "").Env, []);
  assert.deepEqual(buildGitExecSpec(["git", "status", "--porcelain", "-b"], "").Env, []);
  assert.deepEqual(buildGitExecSpec(["git", "push"], "tok").Env, ["GIT_PAT=tok"]);
  assert.throws(() => buildGitExecSpec(["git", "config", "gpg.ssh.allowedSignersFile", "/x"], ""), { status: 400 });
});
