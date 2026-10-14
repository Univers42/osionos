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

import { createHash, randomBytes } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A sandbox is a shell on a shared machine — access is opt-in per account.
 *  Unset, empty, or only-commas in OSIONOS_IDE_ALLOWED_SUBJECTS → everyone refused. */
export function requireIdeSubject(userId, env) {
  const list = String(env?.OSIONOS_IDE_ALLOWED_SUBJECTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.includes(String(userId).toLowerCase())) {
    throw Object.assign(new Error("The IDE is not enabled for this account."), { status: 403, code: "not-allowed" });
  }
}

/** Owner is the session `sub`; workspace must be one the session already holds.
 *  Both are UUIDs — this throws (403/400) before any name is derived so a
 *  cross-tenant or malformed request never provisions.
 *  The subject allow-list is checked FIRST so an unlisted account learns
 *  nothing about workspace ids. */
export function requireSandboxIdentity(session, workspaceId, env) {
  const userId = String(session?.userId ?? "");
  if (!UUID_RE.test(userId)) {
    throw Object.assign(new Error("Invalid session subject."), { status: 401 });
  }
  requireIdeSubject(userId, env);
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

/** Under host-wide memory pressure the kernel kills the highest oom_score_adj first: a box,
 *  never the databases that share the host (they run at the default 0). */
export const SANDBOX_OOM_SCORE_ADJ = 500;

const PROXY_URL = "http://ide-egress:8080";

/** The fixed container-create body. Hardening (conditions 5,14,15) is baked in;
 *  the ONLY inputs are the validated identity + server config. GIT_PAT is NOT in
 *  the container env — it is injected per git op via exec (condition 13). */
export function buildContainerSpec({ userId, workspaceId, image, sandboxNet, volumeName, memoryBytes = 1073741824, nanoCpus = 1_000_000_000, pidsLimit = 512, diskSize = "" }) {
  // Per-container block quota. overlay2 StorageOpt.size ONLY works over xfs+pquota
  // (NOT ext4-prjquota), so it's opt-in via OSIONOS_IDE_STORAGE_QUOTA — omitted by
  // default. The host is already blast-bounded by the docker-ide loopback data-root.
  const storageOpt = diskSize ? { StorageOpt: { size: diskSize } } : {};
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
      OomScoreAdj: SANDBOX_OOM_SCORE_ADJ,
      NanoCpus: nanoCpus,
      Ulimits: [
        { Name: "core", Soft: 0, Hard: 0 },   // no core dumps (condition 14)
        { Name: "nproc", Soft: pidsLimit, Hard: pidsLimit },
        { Name: "nofile", Soft: 4096, Hard: 4096 },
      ],
      ...storageOpt, // per-container block quota, only when xfs+pquota is available
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

/** Validate a workspace-relative path used by the fs ops. Beyond traversal,
 *  newline/tab/CR are refused because the op outputs are line/field-parsed —
 *  the VFS surfaces that as an honest Unsupported, never silent mangling. */
export function assertRelPath(relPath) {
  if (typeof relPath !== "string" || relPath.includes("..") || relPath.startsWith("/")) {
    throw Object.assign(new Error("invalid path"), { status: 400 });
  }
  if (/[\n\r\t\0]/.test(relPath)) {
    throw Object.assign(new Error("unrepresentable path character"), { status: 400 });
  }
}

const FS_OP_COMMON = { User: "10001:10001", WorkingDir: "/workspace", AttachStdout: true, AttachStderr: false, Tty: true };
const READ_CAP_BYTES = 512 * 1024;
// A write's content rides one argv item, and Linux refuses an exec whose single
// argument passes 128 KiB (MAX_ARG_STRLEN): a 400 KB file failed to save with
// E2BIG. Bigger content arrives in pieces staged under one token (part first,
// more, last); the last piece moves the staged file into place, so a reader
// still never sees half a file. sandboxProvider.ts WRITE_PIECE_B64 matches.
export const WRITE_PIECE_B64 = 96 * 1024;
const WRITE_PARTS = new Set(['first', 'more', 'last']);
// One attach asks for at most 500 (MAX_ATTACH_FILES); 1000 paths of 255 bytes stay far under ARG_MAX.
export const MAX_HASH_PATHS = 1000;

// Portable sh snippets (busybox AND debian coreutils — the conformance corpus
// executes them through the REAL local sh in tests). Failures print one
// VFSERR:<tag> token the client maps into the FsError taxonomy; every path is
// prefixed "./" so a name starting with "-" can never read as an option.
// list globs instead of running ls: every op runs with Tty:true, and GNU ls on a
// terminal shell-quotes a name with a space ('with space.txt'), which the explorer
// showed quoted and could not open (busybox ls never quotes, so the alpine test
// image missed it; vfs-conformance's "sh on a tty" target pins it).
const FS_OP_SCRIPTS = {
  read: `f="./$1"; if [ ! -e "$f" ]; then echo VFSERR:ENOENT; exit 1; fi
if [ -d "$f" ]; then echo VFSERR:EISDIR; exit 1; fi
s=$(wc -c < "$f"); if [ "$s" -gt ${READ_CAP_BYTES} ]; then echo VFSERR:E2BIG; exit 1; fi
tail -c +$(($2 + 1)) "$f" | head -c "$3" | base64 | tr -d '\\n'`,
  stat: `f="./$1"; if [ ! -e "$f" ]; then echo VFSERR:ENOENT; exit 1; fi
if [ -d "$f" ]; then k=dir; s=0; else k=file; s=$(wc -c < "$f"); fi
printf '%s|%s|%s' "$k" "$s" "$(date -r "$f" +%s 2>/dev/null || echo 0)"`,
  list: `f="./$1"; if [ ! -e "$f" ]; then echo VFSERR:ENOENT; exit 1; fi
if [ ! -d "$f" ]; then echo VFSERR:ENOTDIR; exit 1; fi
cd "$f" && [ -r . ] || exit 1
nl='
'; cr=$(printf '\\r')
for e in * .[!.]* ..?*; do
  case $e in *"$nl"* | *"$cr"*) continue ;; esac
  if [ -d "$e" ]; then printf '%s/\\n' "$e"; elif [ -e "$e" ] || [ -L "$e" ]; then printf '%s\\n' "$e"; fi
done`,
  mkdir: `f="./$1"; if [ -e "$f" ]; then echo VFSERR:EEXIST; exit 1; fi
d=$(dirname "$f"); if [ ! -d "$d" ]; then echo VFSERR:ENOPARENT; exit 1; fi
mkdir "$f"`,
  delete: `f="./$1"; if [ ! -e "$f" ] && [ ! -L "$f" ]; then echo VFSERR:ENOENT; exit 1; fi
if [ -d "$f" ] && [ "$2" != 1 ]; then rmdir "$f" 2>/dev/null || { echo VFSERR:ENOTEMPTY; exit 1; }; else rm -rf "$f"; fi`,
  rename: `a="./$1"; b="./$2"; if [ ! -e "$a" ]; then echo VFSERR:ENOENT; exit 1; fi
d=$(dirname "$b"); if [ ! -d "$d" ]; then echo VFSERR:ENOPARENT; exit 1; fi
if [ -e "$b" ]; then
  if [ "$3" != 1 ]; then echo VFSERR:EEXIST; exit 1; fi
  if [ -d "$b" ] || [ -d "$a" ]; then echo VFSERR:EEXIST; exit 1; fi
fi
mv "$a" "$b"`,
  // One sha256sum for every regular file (444 ms for 1000 files with a process
  // per file, 11 ms with one); a missing path prints "-  ./path" in the same
  // shape; a directory or an unreadable file prints nothing. Paths start at $1.
  hashes: `n=$#
for p do
  f="./$p"
  if [ -f "$f" ]; then set -- "$@" "$f"
  elif [ ! -e "$f" ] && [ ! -L "$f" ]; then printf -- '-  %s\\n' "$f"
  fi
done
shift "$n"
[ $# -eq 0 ] || sha256sum -- "$@" 2>/dev/null
exit 0`,
  write: `f="./$1"; d=$(dirname "$f"); mkdir -p "$d" || { echo VFSERR:EIO; exit 1; }
if [ -d "$f" ]; then echo VFSERR:EISDIR; exit 1; fi
t="$f.vfstmp\${3:-$$}"
if [ "$4" = more ] || [ "$4" = last ]; then printf %s "$2" | base64 -d >> "$t"; else printf %s "$2" | base64 -d > "$t"; fi || { rm -f "$t"; echo VFSERR:EIO; exit 1; }
if [ "$4" = first ] || [ "$4" = more ]; then exit 0; fi
mv "$t" "$f"`,
};

/** One exec spec per VFS op (ADR-001 second slice — closes the write-only
 *  sandbox hole). Everything client-influenced rides ARGV items; numbers are
 *  validated integers; outputs are parsed client-side (bridge stays dumb). */
export function buildFsOpSpec(op, params = {}) {
  const script = FS_OP_SCRIPTS[op];
  if (!script) throw Object.assign(new Error(`unknown fs op: ${String(op)}`), { status: 400 });
  if (op === "hashes") {
    const paths = params.paths;
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_HASH_PATHS) {
      throw Object.assign(new Error(`hashes needs 1-${MAX_HASH_PATHS} paths`), { status: 400 });
    }
    for (const path of paths) {
      assertRelPath(path);
      if (!path) throw Object.assign(new Error("missing path"), { status: 400 });
    }
    return { ...FS_OP_COMMON, Cmd: ["sh", "-c", script, "sh", ...paths] };
  }
  assertRelPath(params.path ?? "");
  const args = [params.path ?? ""];
  if (op === "read") {
    const offset = Number.isInteger(params.offset) && params.offset > 0 ? params.offset : 0;
    const length = Number.isInteger(params.length) && params.length >= 0 ? params.length : READ_CAP_BYTES;
    args.push(String(offset), String(length));
  } else if (op === "delete") {
    args.push(params.recursive ? "1" : "");
  } else if (op === "rename") {
    assertRelPath(params.to ?? "");
    if (!params.to) throw Object.assign(new Error("rename needs a target"), { status: 400 });
    args.push(params.to, params.overwrite ? "1" : "");
  } else if (op === "write") {
    if (typeof params.contentBase64 !== "string") throw Object.assign(new Error("write needs base64 content"), { status: 400 });
    if (params.contentBase64.length > WRITE_PIECE_B64) {
      throw Object.assign(new Error(`write piece over ${WRITE_PIECE_B64} base64 characters; send it in parts`), { status: 413 });
    }
    args.push(params.contentBase64);
    if (params.part !== undefined) {
      if (!WRITE_PARTS.has(params.part) || !/^[0-9]{8,32}$/.test(String(params.stage ?? ""))) {
        throw Object.assign(new Error("a write part needs part first|more|last and an 8-32 digit stage token"), { status: 400 });
      }
      args.push(params.stage, params.part);
    }
  }
  if (!params.path && op !== "list" && op !== "stat") {
    throw Object.assign(new Error("missing path"), { status: 400 });
  }
  return { ...FS_OP_COMMON, Cmd: ["sh", "-c", script, "sh", ...args] };
}

/** The exec specs that write one file, run in order until one exits non-zero:
 *  one exec when the content fits an argv item, else pieces staged under one
 *  random token (WRITE_PIECE_B64). Caveat: an exec that dies between pieces
 *  (the container stopped) leaves `<file>.vfstmp<token>` beside the file. */
export function buildWriteSpecs(relPath, contentBase64) {
  if (typeof contentBase64 !== "string" || contentBase64.length <= WRITE_PIECE_B64) {
    return [buildFsOpSpec("write", { path: relPath, contentBase64 })];
  }
  // Digits only: osio-fs-agent ignores `<file>.vfstmp<digits>`, so the staged file never syncs back as a page.
  const stage = randomBytes(8).readBigUInt64BE().toString().padStart(20, "0");
  const specs = [];
  for (let at = 0; at < contentBase64.length; at += WRITE_PIECE_B64) {
    const part = at === 0 ? "first" : at + WRITE_PIECE_B64 >= contentBase64.length ? "last" : "more";
    specs.push(buildFsOpSpec("write", { path: relPath, contentBase64: contentBase64.slice(at, at + WRITE_PIECE_B64), stage, part }));
  }
  return specs;
}

/** A file-write exec spec (materialize / editor→container) — the legacy shape,
 *  now atomic (temp + mv, no partial-write window) via buildFsOpSpec. */
export function buildWriteExecSpec(relPath, contentBase64 = "") {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw Object.assign(new Error("invalid write path"), { status: 400 });
  }
  return buildFsOpSpec("write", { path: relPath, contentBase64 });
}

/** Listening-ports probe for the dock's Ports tab: fixed argv, parse-friendly
 *  output (`ss -tln`, netstat fallback), stderr dropped. */
export function buildPortsExecSpec() {
  return {
    ...FS_OP_COMMON,
    Cmd: ["sh", "-c", "ss -tln 2>/dev/null || netstat -tln 2>/dev/null || echo VFSERR:UNSUP"],
  };
}

// The in-sandbox preview tunnel agent, passed INLINE via `node -e` (argv item —
// no shell, no image rebuild/re-seed needed; moves into the image at the next
// scheduled rebuild). One u32-length-prefixed JSON frame per request/response;
// GET/HEAD only, 2 MiB body cap, base64 bodies. Port forwarding thus rides the
// EXISTING exec channel — no new network path, every isolation invariant kept.
const TUNNEL_AGENT_SOURCE = `
const http = require("node:http");
const port = Number(process.argv[process.argv.length - 1]);
let buf = Buffer.alloc(0);
const send = (o) => { const b = Buffer.from(JSON.stringify(o)); const h = Buffer.alloc(4); h.writeUInt32BE(b.length, 0); process.stdout.write(h); process.stdout.write(b); };
const handle = (m) => {
  const req = http.request({ host: "127.0.0.1", port, path: m.path, method: m.method, headers: m.headers }, (res) => {
    const chunks = []; let total = 0;
    res.on("data", (c) => { total += c.length; if (total <= 2097152) chunks.push(c); });
    res.on("end", () => { const body = Buffer.concat(chunks); send({ id: m.id, status: res.statusCode || 502, headers: { "content-type": String(res.headers["content-type"] || "") }, body: total <= 2097152 ? body.toString("base64") : "", truncated: total > 2097152 }); });
  });
  req.on("error", (e) => send({ id: m.id, status: 502, headers: {}, body: Buffer.from("preview upstream error: " + e.message).toString("base64"), truncated: false }));
  req.end();
};
process.stdin.on("data", (c) => {
  buf = Buffer.concat([buf, c]);
  for (;;) {
    if (buf.length < 4) return;
    const n = buf.readUInt32BE(0);
    if (buf.length < 4 + n) return;
    let m; try { m = JSON.parse(buf.subarray(4, 4 + n).toString()); } catch { m = null; }
    buf = buf.subarray(4 + n);
    if (m && typeof m.id === "number" && typeof m.path === "string") handle(m);
  }
});
`;

/** The preview tunnel exec: Tty OFF (binary frames must arrive untouched — the
 *  bridge strips docker's mux headers), stdin attached, fixed argv. */
export function buildPortTunnelExecSpec(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error("invalid preview port"), { status: 400 });
  }
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: false,
    Cmd: ["node", "-e", TUNNEL_AGENT_SOURCE, "tunnel", String(port)],
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
 *  FIXED argv, no GIT_PAT. Stdin attached and no TTY, like a language server: dockerd
 *  closes an exec's stdin when its stream closes only without a TTY, and the agent exits
 *  on that EOF. Under Tty:true every reload left an agent behind (60-70 MB each; seven
 *  held ~450 MB of the demo box's 1 GiB and `make -j8` failed, 2026-10-14). Stdout is
 *  multiplexed, so the bridge demuxes it as it does the language servers'. */
export function buildFsAgentExecSpec() {
  return {
    User: "10001:10001",
    WorkingDir: "/workspace",
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: false,
    Tty: false,
    Cmd: ["node", "/usr/local/lib/osio-fs-agent.mjs"],
  };
}
