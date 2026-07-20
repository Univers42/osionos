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
  requireSandboxIdentity, deriveNames, buildContainerSpec, buildGitExecSpec, buildShellExecSpec,
  buildSearchExecSpec, buildWriteExecSpec,
} from "../../scripts/ide-sandbox-spec.mjs";

const U = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";
const session = { userId: U, workspaceIds: [W] };

test("identity: owner from session, workspace ownership-checked (devil #11)", () => {
  assert.deepEqual(requireSandboxIdentity(session, W), { userId: U, workspaceId: W });
  assert.throws(() => requireSandboxIdentity(session, "33333333-3333-4333-8333-333333333333"), /No access/);
  assert.throws(() => requireSandboxIdentity({ userId: "not-a-uuid", workspaceIds: [W] }, W), /session subject/);
  assert.throws(() => requireSandboxIdentity(session, "../../etc"), /workspace id/);
  assert.throws(() => requireSandboxIdentity(session, "mini-baas-postgres"), /workspace id/);
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
  const spec = buildContainerSpec({ userId: U, workspaceId: W, image: "sha256:pinned", sandboxNet: "sandbox-net", volumeName });
  assert.deepEqual(spec.HostConfig.CapDrop, ["ALL"]);
  assert.ok(spec.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.equal(spec.HostConfig.ReadonlyRootfs, true);
  assert.equal(spec.User, "10001:10001");
  assert.equal(spec.HostConfig.NetworkMode, "sandbox-net");
  // exactly one mount: the derived volume; no host binds.
  assert.equal(spec.HostConfig.Mounts.length, 1);
  assert.equal(spec.HostConfig.Mounts[0].Type, "volume");
  assert.equal(spec.HostConfig.Mounts[0].Source, volumeName);
  assert.equal(spec.HostConfig.Binds, undefined);
  assert.equal(spec.HostConfig.Privileged, undefined);
  // core dumps off; caps present.
  assert.ok(spec.HostConfig.Ulimits.some((u) => u.Name === "core" && u.Hard === 0));
  // block quota is opt-in (xfs+pquota only) — omitted by default, applied when asked.
  assert.equal(spec.HostConfig.StorageOpt, undefined);
  const quota = buildContainerSpec({ userId: U, workspaceId: W, image: "x", sandboxNet: "n", volumeName, diskSize: "2G" });
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
  assert.equal(spec.User, "10001:10001");
  assert.throws(() => buildGitExecSpec(["rm", "-rf", "/"], "x"), /argv must start with git/);
  // the interactive shell spec carries no secret at all.
  const shell = buildShellExecSpec();
  assert.deepEqual(shell.Cmd, ["/bin/bash", "-l"]);
  assert.ok(!shell.Env.some((e) => e.startsWith("GIT_PAT")));
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
  assert.throws(() => buildWriteExecSpec("../etc/passwd"), /invalid write/);
  assert.throws(() => buildWriteExecSpec("/etc/passwd"), /invalid write/);
  assert.throws(() => buildWriteExecSpec(""), /invalid write/);
});
