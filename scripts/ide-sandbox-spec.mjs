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

// The only git subcommands the source-control UI issues. `config` is DENIED so a
// caller can never set credential.helper=store and defeat the per-op PAT guard
// (condition 13); arbitrary subcommands are refused.
const GIT_SUBCOMMANDS = new Set([
  "status", "add", "reset", "restore", "commit", "push", "pull", "fetch",
  "clone", "checkout", "switch", "branch", "log", "diff", "show", "stash",
  "init", "remote", "rev-parse", "ls-files",
]);

/** A per-git-operation exec spec: a validated argv (fixed `git`, allowlisted
 *  subcommand, arguments passed as ARGV items so nothing is shell-interpolated),
 *  GIT_PAT injected ONLY here (never the shell / never persisted), run as coder
 *  in /workspace. Tty collects clean output (no stream-mux header). */
export function buildGitExecSpec(argv, gitPat) {
  if (!Array.isArray(argv) || argv[0] !== "git" || typeof argv[1] !== "string") {
    throw Object.assign(new Error("git exec argv must start with git <subcommand>"), { status: 400 });
  }
  if (!GIT_SUBCOMMANDS.has(argv[1])) {
    throw Object.assign(new Error(`git subcommand not allowed: ${argv[1]}`), { status: 400 });
  }
  if (argv.some((a) => typeof a !== "string")) {
    throw Object.assign(new Error("git argv must be strings"), { status: 400 });
  }
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: gitPat ? [`GIT_PAT=${gitPat}`] : [],
    Cmd: argv,
  };
}

/** A search exec spec: ripgrep with fixed flags; the query + optional path are
 *  ARGV items (never shell). `--` stops flag parsing so a query starting with
 *  `-` can't inject a ripgrep flag. */
export function buildSearchExecSpec(query, maxCount = 200) {
  if (typeof query !== "string" || query.length === 0 || query.length > 512) {
    throw Object.assign(new Error("invalid search query"), { status: 400 });
  }
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdout: true,
    AttachStderr: false,
    Tty: true,
    Cmd: ["rg", "--json", "--max-count", String(maxCount), "--", query, "."],
  };
}

/** A file-write exec spec (materialize / editor→container). Path AND base64
 *  content are ARGV items (never shell-interpolated); the script makes the
 *  parent dir then decodes stdin-free (avoids an exec hijack for stdin).
 *  ponytail: base64-in-argv caps at ARG_MAX (~MB) — fine for code files. */
export function buildWriteExecSpec(relPath, contentBase64 = "") {
  if (typeof relPath !== "string" || relPath.includes("..") || relPath.startsWith("/") || relPath.length === 0) {
    throw Object.assign(new Error("invalid write path"), { status: 400 });
  }
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ["sh", "-c", 'mkdir -p "$(dirname "$1")" && printf %s "$2" | base64 -d > "$1"', "sh", relPath, contentBase64],
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

/** The fs-watcher exec spec (P4 writeback): runs the in-image fs-agent, which
 *  streams one JSON line per /workspace change (ignore set applied in-container).
 *  FIXED argv, no GIT_PAT. Tty:true so stdout arrives unmultiplexed (line-clean)
 *  — the consumer tolerates the CR the TTY adds and skips non-JSON lines. */
export function buildFsAgentExecSpec() {
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdout: true,
    AttachStderr: false,
    Tty: true,
    Cmd: ["node", "/usr/local/lib/osio-fs-agent.mjs"],
  };
}
