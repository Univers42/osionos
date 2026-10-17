// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-docker.mjs                                     :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// Minimal Docker Engine API client for the IDE provisioner. It talks ONLY to the
// docker-socket-proxy (TCP), which allowlists the endpoints below and denies
// build/images/privileged/binds (devil condition 2). It NEVER touches the host
// socket. Node built-ins only. Every method takes SERVER-DERIVED names — no
// client string reaches a path (condition 9).

import http from "node:http";

// Hard cap on any single docker API response we buffer. git/search downstream
// caps apply AFTER the buffer exists, so this bounds a hostile `git log -p` /
// broad search from OOMing the shared bridge (review finding).
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/** Longest any single docker API call may stay silent. An exec whose user cannot be resolved can
 *  block runc for good (a FIFO at /etc/passwd's target, docs/adr/0009), so no call may wait
 *  without a bound; the env override can only lower it.
 *  Caveat: this is socket inactivity, not total time: a daemon that trickles bytes is not cut. */
export const DOCKER_REQUEST_TIMEOUT_MS = 20_000;

function requestTimeoutMs(env) {
  const asked = Number(env.OSIONOS_IDE_DOCKER_TIMEOUT_MS);
  return Number.isInteger(asked) && asked >= 50 ? Math.min(asked, DOCKER_REQUEST_TIMEOUT_MS) : DOCKER_REQUEST_TIMEOUT_MS;
}

/** One JSON request to the docker API via the socket-proxy. Resolves
 *  { status, body } — the caller decides what a status means (404 is normal
 *  for "container absent"). */
function dockerRequest({ host, port, timeoutMs }, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      { host, port, method, path, headers: {
        "content-type": "application/json",
        ...(payload ? { "content-length": payload.length } : {}),
      }, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        let size = 0;
        let truncated = false;
        res.on("data", (c) => {
          if (truncated) return;
          size += c.length;
          if (size > MAX_RESPONSE_BYTES) { truncated = true; req.destroy(); return; }
          chunks.push(c);
        });
        const finish = () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* non-json / truncated */ }
          resolve({ status: res.statusCode ?? 0, body: json, text });
        };
        res.on("end", finish);
        res.on("close", () => { if (truncated) finish(); });
      },
    );
    req.on("timeout", () => req.destroy(new Error("docker request timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const isInitContainer = (container) => (container?.Names ?? []).some((n) => n.startsWith("/ideinit-"));

export function createDockerClient(env = process.env) {
  const [host, portRaw] = String(env.OSIONOS_IDE_DOCKER_HOST || "").split(":");
  const port = Number(portRaw || 2375);
  const timeoutMs = requestTimeoutMs(env);
  const endpoint = { host, port, timeoutMs };
  const call = (method, path, body) => dockerRequest(endpoint, method, path, body);

  return {
    async ping() {
      const res = await call("GET", "/_ping");
      return res.status === 200;
    },
    async ensureNetwork(name, { internal = false } = {}) {
      const existing = await call("GET", `/networks/${name}`);
      if (existing.status === 200) return existing.body?.Id;
      const created = await call("POST", "/networks/create", { Name: name, Driver: "bridge", Internal: internal, CheckDuplicate: true });
      if (created.status >= 300) throw new Error(`network create failed (${created.status})`);
      return created.body?.Id;
    },
    async ensureVolume(name) {
      const created = await call("POST", "/volumes/create", { Name: name, Driver: "local", Labels: { "osio.ide.managed": "1" } });
      if (created.status >= 300) throw new Error(`volume create failed (${created.status})`);
      return created.body?.Name;
    },
    async inspect(name) {
      const res = await call("GET", `/containers/${name}/json`);
      if (res.status === 404) return null;
      if (res.status >= 300) throw new Error(`inspect failed (${res.status})`);
      return res.body;
    },
    async create(name, spec) {
      const res = await call("POST", `/containers/create?name=${encodeURIComponent(name)}`, spec);
      if (res.status >= 300) throw Object.assign(new Error(`create failed (${res.status}): ${res.text}`), { status: res.status });
      return res.body?.Id;
    },
    async start(name) {
      const res = await call("POST", `/containers/${name}/start`);
      if (res.status >= 300 && res.status !== 304) throw new Error(`start failed (${res.status})`);
    },
    async stop(name, timeoutSec = 5) {
      const res = await call("POST", `/containers/${name}/stop?t=${timeoutSec}`);
      if (res.status >= 300 && res.status !== 304 && res.status !== 404) throw new Error(`stop failed (${res.status})`);
    },
    async remove(name) {
      const res = await call("DELETE", `/containers/${name}?force=true&v=false`);
      if (res.status >= 300 && res.status !== 404) throw new Error(`remove failed (${res.status})`);
    },
    /** The owner's uid, allocated and remembered by the socket proxy (ADR 0011). The proxy, not this
     *  process, is the authority: it refuses a box create whose uid disagrees with its ledger. */
    async allocateUid(owner) {
      const res = await call("POST", "/osio/v1/uid", { owner });
      const uid = res.body?.uid;
      if (res.status !== 200 || !Number.isInteger(uid)) throw new Error(`uid allocation failed (${res.status})`);
      return uid;
    },
    /** Block until the container stops and return its exit code. The wait sends no bytes until then,
     *  so the request's silence bound is the total bound (rejects on timeout; the caller removes it). */
    async waitStopped(name, waitMs) {
      const res = await dockerRequest({ ...endpoint, timeoutMs: waitMs }, "POST", `/containers/${name}/wait?condition=not-running`);
      if (res.status !== 200 || !Number.isInteger(res.body?.StatusCode)) throw new Error(`wait failed (${res.status})`);
      return res.body.StatusCode;
    },
    /** Managed sandboxes, for the idle reaper. Init containers carry the managed label too and are not boxes. Filtered by our label server-side. */
    async listManaged() {
      const filters = encodeURIComponent(JSON.stringify({ label: ["osio.ide.managed=1"] }));
      const res = await call("GET", `/containers/json?all=true&filters=${filters}`);
      return res.status === 200 && Array.isArray(res.body) ? res.body.filter((c) => !isInitContainer(c)) : [];
    },
    /** Run a non-interactive exec (git op / search / probe) on a SERVER-derived
     *  container name and collect its output. Powers git (P6) + search (P7). */
    async runExec(name, execSpec) {
      const created = await call("POST", `/containers/${name}/exec`, execSpec);
      if (created.status >= 300) throw new Error(`exec create failed (${created.status})`);
      const execId = created.body?.Id;
      const started = await call("POST", `/exec/${execId}/start`, { Detach: false, Tty: Boolean(execSpec.Tty) });
      const inspect = await call("GET", `/exec/${execId}/json`);
      return { output: started.text ?? "", exitCode: inspect.body?.ExitCode ?? null };
    },
    /** Resize a running exec's PTY (TIOCSWINSZ), so a wide browser terminal and
     *  the in-container shell agree on geometry — vim/htop and >80-col line
     *  editing render correctly. Best-effort: geometry only, never fatal. */
    async resizeExec(execId, cols, rows) {
      const w = Math.max(1, Math.min(500, Number(cols) | 0));
      const h = Math.max(1, Math.min(300, Number(rows) | 0));
      if (!/^[a-f0-9]+$/.test(String(execId))) return;
      await call("POST", `/exec/${execId}/resize?w=${w}&h=${h}`).catch(() => {});
    },
    /** Inspect a finished exec to read its ExitCode. Returns `{ exitCode: null }`
     *  without any call when execId is not a valid hex id (defensive: callers
     *  may race with a destroyed socket); otherwise GET /exec/${execId}/json.
     *  Non-200 or missing ExitCode → null. Pure for tests via the dockerRequest
     *  seam (the live path is the IDE socket proxy allowlist). */
    async inspectExec(execId) {
      if (!/^[a-f0-9]+$/.test(String(execId))) return { exitCode: null };
      const res = await call("GET", `/exec/${execId}/json`);
      if (res.status !== 200) return { exitCode: null };
      return { exitCode: res.body?.ExitCode ?? null };
    },
    /** Attach a hijacked bidirectional exec stream (PTY / LSP relay). Resolves
     *  `{ stream, execId }`: write = process stdin, data = process stdout; the
     *  execId lets the caller resizeExec the PTY. The socket proxy passes the
     *  upgrade through; the caller bridges it to a WS.
     *  Both requests are bounded by the docker timeout (tests/bridge/ide-exec-timeout.test.mjs). */
    attachExec(name, execSpec) {
      return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(execSpec));
        const createReq = http.request(
          { host, port, method: "POST", path: `/containers/${name}/exec`,
            headers: { "content-type": "application/json", "content-length": body.length }, timeout: timeoutMs },
          (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
              let execId;
              try { execId = JSON.parse(Buffer.concat(chunks).toString()).Id; } catch { return reject(new Error("exec create parse")); }
              if (!execId) return reject(new Error("exec create failed"));
              const startBody = Buffer.from(JSON.stringify({ Detach: false, Tty: Boolean(execSpec.Tty) }));
              const startReq = http.request({
                host, port, method: "POST", path: `/exec/${execId}/start`,
                headers: { "content-type": "application/json", "content-length": startBody.length, Connection: "Upgrade", Upgrade: "tcp" },
                timeout: timeoutMs,
              });
              startReq.on("timeout", () => startReq.destroy(new Error("docker exec start timeout")));
              // Bytes that came in the 101's own segment are handed over as `head`, not read
              // again from the socket: dropped, they were the exec's first output.
              startReq.on("upgrade", (_res, socket, head) => {
                socket.setTimeout(0); // the bound is for the start, not for a shell that sits idle
                if (head.length > 0) socket.unshift(head);
                resolve({ stream: socket, execId });
              });
              startReq.on("error", reject);
              startReq.end(startBody);
            });
          },
        );
        createReq.on("timeout", () => createReq.destroy(new Error("docker exec create timeout")));
        createReq.on("error", reject);
        createReq.end(body);
      });
    },
  };
}
