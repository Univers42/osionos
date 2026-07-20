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

/** One JSON request to the docker API via the socket-proxy. Resolves
 *  { status, body } — the caller decides what a status means (404 is normal
 *  for "container absent"). */
function dockerRequest({ host, port }, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      { host, port, method, path, headers: {
        "content-type": "application/json",
        ...(payload ? { "content-length": payload.length } : {}),
      }, timeout: 20_000 },
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

export function createDockerClient(env = process.env) {
  const [host, portRaw] = String(env.OSIONOS_IDE_DOCKER_HOST || "").split(":");
  const port = Number(portRaw || 2375);
  const endpoint = { host, port };
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
      if (res.status >= 300) throw new Error(`create failed (${res.status}): ${res.text}`);
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
    /** Managed sandboxes, for the idle reaper. Filtered by our label server-side. */
    async listManaged() {
      const filters = encodeURIComponent(JSON.stringify({ label: ["osio.ide.managed=1"] }));
      const res = await call("GET", `/containers/json?all=true&filters=${filters}`);
      return res.status === 200 && Array.isArray(res.body) ? res.body : [];
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
    /** Attach a hijacked bidirectional exec stream (PTY / LSP relay). Resolves a
     *  duplex socket: write = process stdin, data = process stdout. The socket
     *  proxy passes the upgrade through; the caller bridges it to a WS.
     *  ponytail: exercised only against a live sandbox — no unit test, the relay
     *  glue is trivial and the exec engine is covered by runExec's live test. */
    attachExec(name, execSpec) {
      return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(execSpec));
        const createReq = http.request(
          { host, port, method: "POST", path: `/containers/${name}/exec`,
            headers: { "content-type": "application/json", "content-length": body.length } },
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
              });
              startReq.on("upgrade", (_res, socket) => resolve(socket));
              startReq.on("error", reject);
              startReq.end(startBody);
            });
          },
        );
        createReq.on("error", reject);
        createReq.end(body);
      });
    },
  };
}
