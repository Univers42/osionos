// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    bridge-ide-sandbox.mjs                             :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// The IDE sandbox provisioner — the auth-first broker that ensures a persistent
// per-(user,workspace) container exists on the ISOLATED rootless dind daemon.
//
// SECURITY (every point is a devil condition):
//  - Double-gate: OSIONOS_IDE_SANDBOX=1 AND OSIONOS_IDE_DOCKER_HOST set, else 404.
//  - Auth FIRST: verifySession before any docker call.
//  - The docker API is reached ONLY through the socket-proxy (host:OSIONOS_IDE_
//    DOCKER_HOST) which allowlists create/start/exec/stop/remove/volume and
//    denies build/images/privileged/binds (#2). The runtime path here never
//    seeds images or edits networks — that is a one-time privileged bootstrap
//    (ide-sandbox-bootstrap.sh), so this path cannot reach /images (#8).
//  - Names + the whole create spec are SERVER-derived from the verified session;
//    workspace ownership is checked (#11). No client field reaches docker (#8).
//  - Rate-limit + per-user cap; idle reap so a box can't live forever (#16).
//  - The provisioner API is unreachable from any sandbox network (sandboxes sit
//    on the internal dind net; the bridge is elsewhere) and auth-first (#10).

import { bearerToken, readJsonBody } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { createDockerClient } from './ide-docker.mjs';
import { requireSandboxIdentity, deriveNames, buildContainerSpec } from './ide-sandbox-spec.mjs';
import { hasActiveExec } from './bridge-ide-exec.mjs';

const BODY_LIMIT = 8 * 1024;
const SANDBOX_NET = 'osio-ide-sandbox-net';

function jsonReply(response, status, body, config) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': config.allowedOrigin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  });
  response.end(JSON.stringify(body));
}

export function createIdeSandboxHandler({ config, verifySession, env = process.env }) {
  const image = env.OSIONOS_IDE_SANDBOX_IMAGE || 'osionos-ide-sandbox:latest';

  async function ensureContainer(names) {
    const docker = createDockerClient(env);
    const existing = await docker.inspect(names.containerName);
    if (existing?.State?.Running) return { status: 'running', reused: true };
    if (existing) { await docker.remove(names.containerName); } // dead → recreate clean
    await docker.ensureVolume(names.volumeName);
    const spec = buildContainerSpec({
      userId: names.userId, workspaceId: names.workspaceId, image,
      sandboxNet: SANDBOX_NET, volumeName: names.volumeName,
      diskSize: env.OSIONOS_IDE_STORAGE_QUOTA || "", // xfs+pquota only; off by default
    });
    await docker.create(names.containerName, spec);
    await docker.start(names.containerName);
    return { status: 'running', reused: false };
  }

  return async function handleIdeSandboxRoute(url, request, response, requestConfig = config) {
    if (url.pathname !== '/api/ide/session') return false;
    const method = (request.method || 'GET').toUpperCase();

    // Double-gate: unset env → route hidden.
    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) {
      jsonReply(response, 404, { ok: false, message: 'IDE sandbox is not enabled.' }, requestConfig);
      return true;
    }

    // Auth FIRST.
    let session;
    try {
      session = verifySession(bearerToken(request), requestConfig);
    } catch (error) {
      jsonReply(response, error?.status ?? 401, { ok: false, message: error?.message ?? 'Authentication required.' }, requestConfig);
      return true;
    }

    let payload = {};
    if (method !== 'GET') {
      try { payload = await readJsonBody(request, BODY_LIMIT); }
      catch (error) { jsonReply(response, error?.status ?? 400, { ok: false, message: 'Invalid body.' }, requestConfig); return true; }
    } else {
      payload = { workspaceId: url.searchParams.get('workspaceId') };
    }

    // Identity: owner from the token, workspace ownership-checked, names hashed.
    let identity, names;
    try {
      identity = requireSandboxIdentity(session, payload?.workspaceId);
      names = { ...identity, ...deriveNames(identity.userId, identity.workspaceId) };
    } catch (error) {
      jsonReply(response, error?.status ?? 400, { ok: false, message: error?.message ?? 'Invalid request.' }, requestConfig);
      return true;
    }

    try {
      takeToken(`ide-session:${identity.userId}`, { capacity: 20, refillPerSec: 0.2 });
    } catch (error) {
      jsonReply(response, error?.status ?? 429, { ok: false, message: 'Too many sandbox requests.' }, requestConfig);
      return true;
    }

    const docker = createDockerClient(env);
    try {
      if (method === 'DELETE') {
        await docker.stop(names.containerName);
        jsonReply(response, 200, { ok: true, status: 'stopped' }, requestConfig);
        return true;
      }
      if (method === 'GET') {
        const info = await docker.inspect(names.containerName);
        jsonReply(response, 200, { ok: true, status: info?.State?.Running ? 'running' : 'stopped', sandbox: names.digest }, requestConfig);
        return true;
      }
      const result = await ensureContainer(names);
      jsonReply(response, 200, { ok: true, sandbox: names.digest, ...result }, requestConfig);
    } catch (error) {
      jsonReply(response, 502, { ok: false, message: 'Sandbox backend unavailable.' }, requestConfig);
    }
    return true;
  };
}

/** Reap decision for one managed sandbox. Pure + exported for tests: past the
 *  soft lifetime an IDLE box is stopped; a box with live PTY/LSP/fsync streams
 *  survives until the hard cap, so the sweep never guillotines a terminal in
 *  active use. */
export function shouldReapSandbox({ running, createdSec }, now, softMs, hardMs, active) {
  if (!running) return false;
  const ageMs = now - createdSec * 1000;
  if (ageMs <= softMs) return false;
  return !active || ageMs > hardMs;
}

/** Activity-aware reaper — stop managed sandboxes past their lifetime (#16).
 *  Activity = live exec streams tracked by the exec relay (hasActiveExec); a
 *  bridge restart empties that registry, degrading to age-only — accepted.
 *  Volumes persist across the reap; work re-materializes on next open (P4).
 *  Wired by the bridge on an interval. */
export async function reapExpiredSandboxes(env = process.env, maxLifetimeMs = 4 * 60 * 60 * 1000, now = Date.now(), opts = {}) {
  if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) return 0;
  const { isActive = hasActiveExec, hardMaxMs = maxLifetimeMs * 3 } = opts;
  const docker = createDockerClient(env);
  const managed = await docker.listManaged();
  let reaped = 0;
  for (const container of managed) {
    const name = (container.Names?.[0] || '').replace(/^\//, '');
    const snapshot = { running: container.State === 'running', createdSec: Number(container.Created ?? 0) };
    if (shouldReapSandbox(snapshot, now, maxLifetimeMs, hardMaxMs, isActive(name))) {
      await docker.stop(name).catch(() => {});
      reaped += 1;
    }
  }
  return reaped;
}
