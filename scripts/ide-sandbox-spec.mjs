// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-sandbox-spec.mjs                               :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// Server-side Docker spec builder for IDE sandboxes. EVERY container-create
// parameter is templated here from (userId, workspaceId) only — no client field
// reaches the docker API (devil conditions 8, 9, 11). Pure + no deps, so the
// security logic is unit-tested without a daemon.

import { createHash } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner is the session `sub`; workspace must be one the session already holds.
 *  Both are UUIDs — this throws (403/400) before any name is derived so a
 *  cross-tenant or malformed request never provisions. */
export function requireSandboxIdentity(session, workspaceId) {
  const userId = String(session?.userId ?? "");
  if (!UUID_RE.test(userId)) {
    throw Object.assign(new Error("Invalid session subject."), { status: 401 });
  }
  if (!UUID_RE.test(String(workspaceId ?? ""))) {
    throw Object.assign(new Error("Invalid workspace id."), { status: 400 });
  }
  if (!Array.isArray(session.workspaceIds) || !session.workspaceIds.includes(workspaceId)) {
    throw Object.assign(new Error("No access to this workspace."), { status: 403 });
  }
  return { userId, workspaceId };
}

/** Namespaced, regex-safe resource names derived by hash — never from a raw id,
 *  so a name can carry no `/`, `..`, `;`, or a foreign container name. */
export function deriveNames(userId, workspaceId) {
  const digest = createHash("sha256").update(`${userId}:${workspaceId}`).digest("hex").slice(0, 32);
  const containerName = `ide-${digest}`;
  const volumeName = `osio-ide-vol-${digest}`;
  if (!/^ide-[0-9a-f]{32}$/.test(containerName) || !/^osio-ide-vol-[0-9a-f]{32}$/.test(volumeName)) {
    throw new Error("derived name failed validation"); // unreachable; defense in depth
  }
  return { digest, containerName, volumeName };
}

const PROXY_URL = "http://ide-egress:8080";

/** The fixed container-create body. Hardening (conditions 5,14,15) is baked in;
 *  the ONLY inputs are the validated identity + server config. GIT_PAT is NOT in
 *  the container env — it is injected per git op via exec (condition 13). */
export function buildContainerSpec({ userId, workspaceId, image, sandboxNet, volumeName, memoryBytes = 1073741824, nanoCpus = 1_000_000_000, pidsLimit = 512, diskSize = "2G" }) {
  return {
    Image: image,
    User: "10001:10001",
    WorkingDir: "/workspace",
    Cmd: ["sleep", "infinity"],
    Env: [
      `HTTP_PROXY=${PROXY_URL}`, `HTTPS_PROXY=${PROXY_URL}`,
      `http_proxy=${PROXY_URL}`, `https_proxy=${PROXY_URL}`,
      "NO_PROXY=localhost,127.0.0.1", "no_proxy=localhost,127.0.0.1",
      "GIT_TERMINAL_PROMPT=0",
    ],
    Labels: {
      "osio.ide.managed": "1",
      "osio.ide.owner": userId,
      "osio.ide.workspace": workspaceId,
    },
    HostConfig: {
      NetworkMode: sandboxNet,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: true,
      Mounts: [{ Type: "volume", Source: volumeName, Target: "/workspace" }],
      Tmpfs: { "/tmp": "size=64m,mode=1777", "/home/coder": "size=64m,mode=0700,uid=10001,gid=10001" },
      PidsLimit: pidsLimit,
      Memory: memoryBytes,
      MemorySwap: memoryBytes, // no swap headroom beyond mem
      NanoCpus: nanoCpus,
      Ulimits: [
        { Name: "core", Soft: 0, Hard: 0 },   // no core dumps (condition 14)
        { Name: "nproc", Soft: pidsLimit, Hard: pidsLimit },
        { Name: "nofile", Soft: 4096, Hard: 4096 },
      ],
      StorageOpt: { size: diskSize }, // block quota (needs pquota-capable data-root)
      RestartPolicy: { Name: "no" },
    },
  };
}

/** A per-git-operation exec spec: fixed argv, GIT_PAT injected ONLY here (never
 *  the shell / never persisted), run as the coder user in /workspace. */
export function buildGitExecSpec(argv, gitPat) {
  if (!Array.isArray(argv) || argv[0] !== "git") {
    throw Object.assign(new Error("git exec argv must start with git"), { status: 400 });
  }
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdout: true,
    AttachStderr: true,
    Env: gitPat ? [`GIT_PAT=${gitPat}`] : [],
    Cmd: argv,
  };
}

/** An interactive-shell exec spec — a FIXED argv, no GIT_PAT, TTY on. The
 *  container is resolved by the derived name at the call site, never a client id. */
export function buildShellExecSpec() {
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ["TERM=xterm-256color"],
    Cmd: ["/bin/bash", "-l"],
  };
}
