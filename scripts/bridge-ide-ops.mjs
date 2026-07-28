// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    bridge-ide-ops.mjs                                 :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// The IDE non-interactive ops: git (P6), container-backed ripgrep (P7), and file
// write (P4 editor→container / materialize). All run through the SAME exec engine
// the runner-daemon test proved, on the SERVER-derived container name, with
// validated argv (ide-sandbox-spec). Same double-gate + auth as the provisioner.
//
// PAT: request-scoped. The client sends the pasted token with a push/pull op; it
// is injected into that ONE git exec and never stored (condition 12/13). Nothing
// PAT lives server-side between requests.

import { bearerToken, readJsonBody } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { createDockerClient } from './ide-docker.mjs';
import { createStdStreamDemux } from './bridge-ide-exec.mjs';
import {
  requireSandboxIdentity, deriveNames, buildGitExecSpec, buildSearchExecSpec, buildWriteExecSpec, buildFsOpSpec, buildPortsExecSpec, buildPortTunnelExecSpec,
} from './ide-sandbox-spec.mjs';

const BODY_LIMIT = 1024 * 1024; // editor writes carry (base64) file content

function reply(response, status, body, config) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'access-control-allow-origin': config.allowedOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin',
  });
  response.end(JSON.stringify(body));
}

/** ripgrep `--json` → flat matches. One JSON object per line; we keep `match`
 *  events. Pure + exported for a fixture test (no daemon needed). */
export function parseRipgrepJson(output) {
  const results = [];
  for (const line of output.split('\n')) {
    if (!line.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'match') continue;
    const path = event.data?.path?.text;
    const text = (event.data?.lines?.text ?? '').replace(/\n$/, '');
    const lineNumber = event.data?.line_number;
    if (path && lineNumber) results.push({ path, lineNumber, line: text.slice(0, 200) });
    if (results.length >= 500) break;
  }
  return results;
}

/** Auth + identity + a running sandbox, or throw a {status} error. Rate-limit is
 *  charged BEFORE the shared-daemon inspect, so a flood is rejected locally with
 *  429 and never load-amplifies onto the docker daemon (review finding). */
async function resolveSandbox(request, payload, env, config, verifySession, bucket = { id: 'ide-ops', capacity: 60, refillPerSec: 1 }) {
  const session = verifySession(bearerToken(request), config);
  const identity = requireSandboxIdentity(session, payload?.workspaceId);
  takeToken(`${bucket.id}:${identity.userId}`, { capacity: bucket.capacity, refillPerSec: bucket.refillPerSec });
  const names = { ...identity, ...deriveNames(identity.userId, identity.workspaceId) };
  const docker = createDockerClient(env);
  const info = await docker.inspect(names.containerName);
  if (!info?.State?.Running) throw Object.assign(new Error('No running sandbox. Open the workspace first.'), { status: 409 });
  return { docker, names };
}

/** One u32BE-length-prefixed JSON frame (the tunnel wire format, both ways). */
export function encodeTunnelFrame(message) {
  const body = Buffer.from(JSON.stringify(message));
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

/** Stateful tunnel-frame decoder: feed chunks, get parsed messages. */
export function createTunnelFrameDecoder() {
  let pending = Buffer.alloc(0);
  return function feed(chunk) {
    pending = Buffer.concat([pending, chunk]);
    const messages = [];
    for (;;) {
      if (pending.length < 4) break;
      const size = pending.readUInt32BE(0);
      if (pending.length < 4 + size) break;
      try { messages.push(JSON.parse(pending.subarray(4, 4 + size).toString())); } catch { /* skip garbage frame */ }
      pending = pending.subarray(4 + size);
    }
    return messages;
  };
}

// Preview tunnels: one bridge-held exec per (container, port) running the
// inline agent; requests multiplex over its stdio. Idle tunnels close after
// 5 min; a dead tunnel rejects its in-flight requests and respawns on demand.
const tunnels = new Map();
const TUNNEL_IDLE_MS = 5 * 60 * 1000;
const TUNNEL_TIMEOUT_MS = 15 * 1000;

async function getOrCreateTunnel(docker, containerName, port) {
  const key = `${containerName}|${port}`;
  const existing = tunnels.get(key);
  if (existing && !existing.dead) return existing;
  const { stream } = await docker.attachExec(containerName, buildPortTunnelExecSpec(port));
  const tunnel = { stream, pending: new Map(), nextId: 1, dead: false, idleTimer: null };
  const demux = createStdStreamDemux();
  const decode = createTunnelFrameDecoder();
  const bumpIdle = () => {
    clearTimeout(tunnel.idleTimer);
    tunnel.idleTimer = setTimeout(() => stream.destroy(), TUNNEL_IDLE_MS);
    tunnel.idleTimer.unref?.();
  };
  stream.on('data', (chunk) => {
    for (const payload of demux(chunk)) {
      for (const message of decode(payload)) {
        tunnel.pending.get(message.id)?.resolve(message);
        tunnel.pending.delete(message.id);
      }
    }
    bumpIdle();
  });
  const die = () => {
    tunnel.dead = true;
    tunnels.delete(key);
    clearTimeout(tunnel.idleTimer);
    for (const waiter of tunnel.pending.values()) waiter.reject(Object.assign(new Error('preview tunnel closed'), { status: 502 }));
    tunnel.pending.clear();
  };
  stream.on('close', die);
  stream.on('error', die);
  bumpIdle();
  tunnels.set(key, tunnel);
  return tunnel;
}

function tunnelRequest(tunnel, message) {
  return new Promise((resolve, reject) => {
    const id = tunnel.nextId++;
    const timer = setTimeout(() => {
      tunnel.pending.delete(id);
      reject(Object.assign(new Error('preview upstream timed out'), { status: 504 }));
    }, TUNNEL_TIMEOUT_MS);
    tunnel.pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    tunnel.stream.write(encodeTunnelFrame({ id, ...message }));
  });
}

const PREVIEW_COOKIE = 'osio_ide_preview';

function previewCookieToken(request) {
  const header = String(request.headers.cookie ?? '');
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === PREVIEW_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Port-forwarded preview over the exec channel (no new network path — the
 *  isolation invariants hold; see ADR-002/backlog). Auth: the app session
 *  token in an HttpOnly, path-scoped cookie minted by the POST — the preview
 *  page's (untrusted!) JS can never read it, and header-auth APIs stay out of
 *  reach. GET/HEAD only. */
export function createIdePreviewHandler({ config, verifySession, env = process.env }) {
  return async function handleIdePreviewRoute(url, request, response, requestConfig = config) {
    if (!url.pathname.startsWith('/api/ide/preview')) return false;
    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) {
      reply(response, 404, { ok: false, message: 'IDE sandbox is not enabled.' }, requestConfig);
      return true;
    }
    const method = (request.method || 'GET').toUpperCase();

    if (url.pathname === '/api/ide/preview/session' && method === 'POST') {
      let payload;
      try {
        payload = await readJsonBody(request, 8 * 1024);
        const token = bearerToken(request);
        const session = verifySession(token, requestConfig);
        requireSandboxIdentity(session, payload?.workspaceId);
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
          'access-control-allow-origin': requestConfig.allowedOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin',
          'set-cookie': `${PREVIEW_COOKIE}=${encodeURIComponent(token)}; Path=/api/ide/preview; HttpOnly; SameSite=Lax; Secure; Max-Age=3600`,
        });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        reply(response, error?.status ?? 401, { ok: false, message: error?.message ?? 'Unauthorized.' }, requestConfig);
      }
      return true;
    }

    const match = /^\/api\/ide\/preview\/([0-9a-f-]{36})\/(\d{1,5})(\/.*)?$/.exec(url.pathname);
    if (!match) { reply(response, 404, { ok: false }, requestConfig); return true; }
    if (method !== 'GET' && method !== 'HEAD') { reply(response, 405, { ok: false }, requestConfig); return true; }

    try {
      const session = verifySession(previewCookieToken(request), requestConfig);
      const identity = requireSandboxIdentity(session, match[1]);
      takeToken(`ide-preview:${identity.userId}`, { capacity: 120, refillPerSec: 40 });
      const names = deriveNames(identity.userId, identity.workspaceId);
      const docker = createDockerClient(env);
      const tunnel = await getOrCreateTunnel(docker, names.containerName, Number(match[2]));
      const upstream = await tunnelRequest(tunnel, {
        method,
        path: `${match[3] || '/'}${url.search}`,
        headers: { accept: String(request.headers.accept ?? '*/*') },
      });
      if (upstream.truncated) {
        reply(response, 502, { ok: false, message: 'Response over the 2 MiB preview cap.' }, requestConfig);
        return true;
      }
      const body = Buffer.from(String(upstream.body ?? ''), 'base64');
      response.writeHead(upstream.status || 502, {
        'content-type': upstream.headers?.['content-type'] || 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'no-store',
      });
      response.end(method === 'HEAD' ? undefined : body);
    } catch (error) {
      reply(response, error?.status ?? 502, { ok: false, message: error?.message ?? 'Preview failed.' }, requestConfig);
    }
    return true;
  };
}

export function createIdeOpsHandler({ config, verifySession, env = process.env }) {
  const routes = new Set(['/api/ide/git', '/api/ide/search', '/api/ide/fs', '/api/ide/ports']);

  return async function handleIdeOpsRoute(url, request, response, requestConfig = config) {
    if (!routes.has(url.pathname)) return false;
    // Gate BEFORE method: a disabled IDE answers 404 to every verb — a 405 first
    // would disclose the route's existence with the feature off.
    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) { reply(response, 404, { ok: false, message: 'IDE sandbox is not enabled.' }, requestConfig); return true; }
    if ((request.method || 'GET').toUpperCase() !== 'POST') { reply(response, 405, { ok: false }, requestConfig); return true; }

    let payload;
    try { payload = await readJsonBody(request, BODY_LIMIT); }
    catch (error) { reply(response, error?.status ?? 400, { ok: false, message: 'Invalid body.' }, requestConfig); return true; }

    // Editor writes (materialize floods) get a wider bucket than git/search —
    // a 500-file workspace must materialize in seconds, not 429 after 60.
    const bucket = url.pathname === '/api/ide/fs'
      ? { id: 'ide-fs', capacity: 120, refillPerSec: 20 }
      : { id: 'ide-ops', capacity: 60, refillPerSec: 1 };
    let ctx;
    try { ctx = await resolveSandbox(request, payload, env, requestConfig, verifySession, bucket); }
    catch (error) { reply(response, error?.status ?? 401, { ok: false, message: error?.message ?? 'Unauthorized.' }, requestConfig); return true; }

    try {
      if (url.pathname === '/api/ide/git') {
        const spec = buildGitExecSpec(payload.argv, typeof payload.pat === 'string' ? payload.pat : undefined);
        const { output, exitCode } = await ctx.docker.runExec(ctx.names.containerName, spec);
        reply(response, 200, { ok: exitCode === 0, exitCode, output: String(output).slice(0, 64 * 1024) }, requestConfig);
      } else if (url.pathname === '/api/ide/ports') {
        const { output, exitCode } = await ctx.docker.runExec(ctx.names.containerName, buildPortsExecSpec());
        reply(response, 200, { ok: exitCode === 0, exitCode, output: String(output).slice(0, 64 * 1024) }, requestConfig);
      } else if (url.pathname === '/api/ide/search') {
        const spec = buildSearchExecSpec(String(payload.query ?? ''), 200);
        const { output } = await ctx.docker.runExec(ctx.names.containerName, spec);
        reply(response, 200, { ok: true, results: parseRipgrepJson(String(output)) }, requestConfig);
      } else if (typeof payload.op === 'string') {
        // VFS exec ops (read/list/stat/mkdir/delete/rename/write-with-base64):
        // the bridge builds the server-derived spec and returns the RAW exec
        // result — parsing and the error taxonomy live client-side where they
        // are unit-tested. Legacy writes (no `op`, raw `content`) stay below.
        const spec = buildFsOpSpec(payload.op, payload);
        const { output, exitCode } = await ctx.docker.runExec(ctx.names.containerName, spec);
        reply(response, 200, { ok: exitCode === 0, exitCode, output: String(output).slice(0, 1024 * 1024) }, requestConfig);
      } else {
        const content = typeof payload.content === 'string' ? payload.content : '';
        const spec = buildWriteExecSpec(String(payload.path ?? ''), Buffer.from(content).toString('base64'));
        const { exitCode } = await ctx.docker.runExec(ctx.names.containerName, spec);
        reply(response, 200, { ok: exitCode === 0 }, requestConfig);
      }
    } catch (error) {
      reply(response, error?.status ?? 500, { ok: false, message: error?.message ?? 'Operation failed.' }, requestConfig);
    }
    return true;
  };
}
