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
  buildSearchExecSpec, buildWriteExecSpec, SANDBOX_OOM_SCORE_ADJ,
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
  const spec = buildContainerSpec({ userId: U, workspaceId: W, image: "sha256:pinned", sandboxNet: "sandbox-net", volumeName });
  assert.deepEqual(spec.HostConfig.CapDrop, ["ALL"]);
  assert.ok(spec.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.equal(spec.HostConfig.ReadonlyRootfs, true);
  assert.equal(spec.User, "10001:10001");
  assert.equal(spec.HostConfig.NetworkMode, "sandbox-net");
  // exactly two mounts, fixed order [workspace, home], both derived volumes; no host binds (H1).
  assert.deepEqual(spec.HostConfig.Mounts, [
    { Type: "volume", Source: volumeName, Target: "/workspace" },
    { Type: "volume", Source: deriveHomeVolume(U), Target: "/home/coder" },
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
  const a = buildContainerSpec({ userId: U, workspaceId: W, image: "x", sandboxNet: "n", volumeName: deriveNames(U, W).volumeName });
  const otherWs = "44444444-4444-4444-4444-444444444444";
  const b = buildContainerSpec({ userId: U, workspaceId: otherWs, image: "x", sandboxNet: "n", volumeName: deriveNames(U, otherWs).volumeName });
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
