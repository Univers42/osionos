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
import { requireSandboxIdentity, deriveNames, deriveHomeVolume, buildContainerSpec, buildKeySyncSpec } from './ide-sandbox-spec.mjs';
import { HOME_REPAIR, runVolumeInit } from './ide-volume-init.mjs';
import { containerHasActivity, disposeSessionsFor, pruneActivity } from './ide-term-sessions.mjs';

const BODY_LIMIT = 8 * 1024;
const SANDBOX_NET = 'osio-ide-sandbox-net';

export function jsonReply(response, status, body, config, extraHeaders = {}) {
  response.writeHead(status, {
    ...extraHeaders,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': config.allowedOrigin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  });
  response.end(JSON.stringify(body));
}

/** A running box with no terminal attached for this long is stopped. 20 min replaces the old 30 min
 *  activity window so background jobs outlive a closed terminal by a bounded, stated time. */
export const SANDBOX_IDLE_MS = 20 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const processStartedMs = Date.now();

/** Reaper lifetimes (#16): past SOFT an idle box is stopped; past HARD any box is. */
export const SANDBOX_SOFT_MAX_MS = 4 * 60 * 60 * 1000;
export const SANDBOX_HARD_MAX_MS = 3 * SANDBOX_SOFT_MAX_MS;
const HARD_CAP = 'SANDBOX_HARD_CAP';
export const SANDBOX_BUSY = 'SANDBOX_BUSY';
export const CREATE_RATE = 'CREATE_RATE';
export const OTHER_WORKSPACE_RUNNING = 'OTHER_WORKSPACE_RUNNING';
export const BUSY_MESSAGE = 'All sandboxes are busy, retry in a minute';
// Caveat: 60 s is a courtesy figure, not a forecast. A slot frees when a user stops a box or the
// idle reaper does (up to SANDBOX_IDLE_MS plus one sweep, about 25 min), so the retry may find it still full.
const BUSY_RETRY_SEC = 60;
const HOUR_MS = 60 * 60 * 1000;
const refusalCodes = new Set([SANDBOX_BUSY, CREATE_RATE, OTHER_WORKSPACE_RUNNING, HOME_REPAIR]);
/** The refusals the user can act on keep their status and message; every other failure stays generic. */
export const isUserFacingRefusal = (error) => refusalCodes.has(error?.code);
const provisioning = new Map(); // containerName → in-flight provision (one per box)

/** How many boxes may run at once on this host (`OSIONOS_IDE_MAX_BOXES`, an integer 1–50).
 *  Ponytail: the default 2 matches a 3 GiB sandbox group with 1 GiB boxes; a host with another
 *  group size needs the env set, and too high a value only moves the refusal into the kernel
 *  (OOM kills inside the group). */
export function maxRunningBoxes(env) {
  const raw = String(env?.OSIONOS_IDE_MAX_BOXES ?? '').trim();
  const n = /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
  return n >= 1 && n <= 50 ? n : 2;
}

// Counting the running boxes and starting one is a critical section: two different boxes
// provisioned at once must not both pass the count. The invariant is one bridge process per
// sandbox daemon (ensureSandbox), so a process-wide chain is enough. A rejected step must not
// poison the chain for the next caller.
let startQueue = Promise.resolve();
function serializeStart(fn) {
  const run = startQueue.then(fn);
  startQueue = run.catch(() => {});
  return run;
}

const limitFromEnv = (raw, fallback) => (/^\d{1,4}$/.test(String(raw ?? '').trim()) && Number(raw) >= 1 ? Number(raw) : fallback);

/** Box-create limits per hour: per user (6) then global (30), both `takeToken` buckets kept for the
 *  hour. The user's bucket is charged first so a refused user never spends the shared budget.
 *  Caveat: in-memory, so a bridge restart refills both. */
function takeCreateSlots(env, userId) {
  const bucket = (key, perHour) => takeToken(key, { capacity: perHour, refillPerSec: perHour / 3600, retainMs: HOUR_MS });
  try {
    bucket(`ide-create:${userId}`, limitFromEnv(env.OSIONOS_IDE_CREATES_PER_USER_HOUR, 6));
    bucket('ide-create:*', limitFromEnv(env.OSIONOS_IDE_CREATES_GLOBAL_HOUR, 30));
  } catch (error) {
    throw Object.assign(new Error('Too many sandboxes started recently; retry later.'), { status: 429, code: CREATE_RATE, retryAfterSec: error.retryAfterSec });
  }
}

const boxName = (container) => (container?.Names?.[0] || '').replace(/^\//, '');

/** Count, then create + start, inside the chain. A box that already runs never gets here.
 *  The owner's OTHER running boxes are stopped (never removed; volumes untouched) so a user
 *  holds one running box; a passive caller is refused instead of doing that on its own. */
function startWithinCap(env, names, docker, passive) {
  return serializeStart(async () => {
    const running = (await docker.listManaged()).filter((c) => c?.State === 'running' && boxName(c) !== names.containerName);
    const others = running.filter((c) => c?.Labels?.['osio.ide.owner'] === names.userId);
    if (passive && others.length > 0) {
      throw Object.assign(new Error('Another workspace is running; open its terminal to switch.'), { status: 409, code: OTHER_WORKSPACE_RUNNING });
    }
    if (running.length - others.length >= maxRunningBoxes(env)) {
      throw Object.assign(new Error(BUSY_MESSAGE), { status: 429, code: SANDBOX_BUSY, retryAfterSec: BUSY_RETRY_SEC });
    }
    takeCreateSlots(env, names.userId);
    for (const other of others) {
      disposeSessionsFor(`${names.userId}|${boxName(other)}`);
      await docker.stop(boxName(other));
    }
    const uid = await prepareVolumes(env, names, docker);
    await createOrAdopt(docker, names, env, uid);
    await docker.start(names.containerName);
    return { status: 'running', reused: false, ...(others.length > 0 ? { stoppedOtherWorkspaces: others.length } : {}) };
  });
}

/** True when a STOPPED container had run for the whole hard lifetime (the reaper's cap). */
function stoppedAtHardCap(container, hardMaxMs) {
  const created = Date.parse(container?.Created ?? '');
  const finished = Date.parse(container?.State?.FinishedAt ?? '');
  return Number.isFinite(created) && Number.isFinite(finished) && finished - created >= hardMaxMs;
}

/** Create the container, adopting one another process created first (409). */
async function createOrAdopt(docker, names, env, uid) {
  const spec = buildContainerSpec({
    userId: names.userId, workspaceId: names.workspaceId,
    image: sandboxImage(env),
    sandboxNet: SANDBOX_NET, volumeName: names.volumeName, uid,
    diskSize: env.OSIONOS_IDE_STORAGE_QUOTA || '', // xfs+pquota only; off by default
  });
  try { await docker.create(names.containerName, spec); } catch (error) { if (error?.status !== 409) throw error; }
}

const sandboxImage = (env) => env.OSIONOS_IDE_SANDBOX_IMAGE || 'osionos-ide-sandbox:latest';

/** Volumes, then the owner's uid from the socket proxy, then the ownership init, before the box exists.
 *  Runs inside the start queue, after the cap check, so a refused start creates nothing. Caveat: an init
 *  that hangs holds the queue for its 120 s bound; a typical run is a stat and returns at once. */
async function prepareVolumes(env, names, docker) {
  await docker.ensureVolume(names.volumeName);
  await docker.ensureVolume(names.homeVolumeName);
  const uid = await docker.allocateUid(names.userId);
  await runVolumeInit(docker, names, { image: sandboxImage(env), uid });
  return uid;
}

/** A box created before per-user uids has no uid label and runs as the shared 10001: it is replaced,
 *  not reused, or its user would keep a uid every other legacy box shares (volumes are kept). */
const isLegacyBox = (inspected) => !inspected?.Config?.Labels?.['osio.ide.uid'];

/** One provision attempt: reuse a running box, else recreate it clean (volume kept).
 *  A passive caller (LSP / fs-sync) never revives a box stopped at the hard cap. */
async function provision(env, names, { passive, docker, hardMaxMs }) {
  const existing = await docker.inspect(names.containerName);
  if (existing?.State?.Running && !isLegacyBox(existing)) return { status: 'running', reused: true };
  if (existing) {
    if (!existing.State?.Running && passive && stoppedAtHardCap(existing, hardMaxMs)) {
      throw Object.assign(new Error('sandbox reached its lifetime cap; open a terminal to restart it'), { code: HARD_CAP });
    }
    const again = await docker.inspect(names.containerName);
    if (again?.State?.Running && !isLegacyBox(again)) return { status: 'running', reused: true };
    if (again) await docker.remove(names.containerName);
  }
  return startWithinCap(env, names, docker, passive);
}

/** What every sandbox path hands to ensureSandbox: the hashed container/volume names AND the
 *  owner/workspace ids, which createOrAdopt writes as the box's labels. The socket-proxy refuses a
 *  create without them ("create rejected: Labels"); the terminal relay passed deriveNames() alone,
 *  so a terminal could never start a stopped box, and a session POST joining that attempt got its
 *  502 (2026-10-14, reproduced inside the VM ide-server). */
export function sandboxNames(identity) {
  return { ...identity, ...deriveNames(identity.userId, identity.workspaceId), homeVolumeName: deriveHomeVolume(identity.userId) };
}

/** Ensure the per-(user,workspace) sandbox container exists and runs. Shared by the
 *  /api/ide/session handler and the PTY attach path (explicit user actions) and by the
 *  LSP/fs-sync attach paths (`passive: true`), which the IDE opens together — so a box is
 *  provisioned by ONE in-flight attempt per process; later callers join it. A terminal that
 *  joins a passive attempt refused at the hard cap retries as itself. Invariant: one bridge
 *  per sandbox daemon (a second process would race the force-remove).
 *  @param opts `{ passive, docker, hardMaxMs }` — `docker` is injectable for tests. */
export function ensureSandbox(env, names, opts = {}) {
  const key = names.containerName;
  const passive = opts.passive === true;
  const pending = provisioning.get(key);
  if (pending) {
    return passive ? pending : pending.catch((error) => (error?.code === HARD_CAP ? ensureSandbox(env, names, opts) : Promise.reject(error)));
  }
  const attempt = provision(env, names, {
    passive, docker: opts.docker ?? createDockerClient(env), hardMaxMs: opts.hardMaxMs ?? SANDBOX_HARD_MAX_MS,
  }).finally(() => { if (provisioning.get(key) === attempt) provisioning.delete(key); });
  provisioning.set(key, attempt);
  return attempt;
}

/** Writes the keys a session request carried into the box. {} when it carried none; {keys:"stale"}
 *  when the write failed for any reason, because a key problem must never fail the session.
 *  Caveat: a stale box keeps the allowed_signers of its last good sync, so a key deleted since
 *  stays trusted there until the next sync succeeds. */
async function syncKeysAfterEnsure(docker, names, keys) {
  if (keys === undefined) return {};
  try {
    const { exitCode } = await docker.runExec(names.containerName, buildKeySyncSpec(keys));
    return exitCode === 0 ? {} : { keys: 'stale' };
  } catch {
    return { keys: 'stale' };
  }
}

export function createIdeSandboxHandler({ config, verifySession, env = process.env, ensure = ensureSandbox, createDocker = createDockerClient }) {
  const ensureContainer = (names) => ensure(env, names);

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
      identity = requireSandboxIdentity(session, payload?.workspaceId, env);
      names = sandboxNames(identity);
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

    const docker = createDocker(env);
    try {
      if (method === 'DELETE') {
        disposeSessionsFor(`${identity.userId}|${names.containerName}`);
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
      const keys = await syncKeysAfterEnsure(docker, names, payload?.keys);
      jsonReply(response, 200, { ok: true, sandbox: names.digest, ...result, ...keys }, requestConfig);
    } catch (error) {
      if (isUserFacingRefusal(error)) {
        const headers = error.retryAfterSec ? { 'retry-after': String(error.retryAfterSec) } : {};
        jsonReply(response, error.status ?? 503, { ok: false, code: error.code, message: error.message }, requestConfig, headers);
      } else jsonReply(response, 502, { ok: false, message: 'Sandbox backend unavailable.' }, requestConfig);
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

/** Idle decision for one managed sandbox: running, no live terminal activity, and a whole idle window
 *  elapsed since it was created or since this process started, whichever is later.
 *  Caveat: the activity registry lives in this process, so after a bridge restart every box looks idle;
 *  the grace from processStartedMs gives reattaching terminals one window to show up. */
export function isIdleExpired({ running, createdSec }, now, idleMs, active, startedMs = processStartedMs) {
  if (!running || active) return false;
  return now - Math.max(createdSec * 1000, startedMs) >= idleMs;
}

/** Activity-aware reaper — stop managed sandboxes past their lifetime (#16).
 *  Activity = live exec streams tracked by the exec relay (hasActiveExec); a
 *  bridge restart empties that registry, degrading to age-only — accepted.
 *  Volumes persist across the reap; work re-materializes on next open (P4).
 *  Wired by the bridge on an interval. */
export async function reapExpiredSandboxes(env = process.env, maxLifetimeMs = SANDBOX_SOFT_MAX_MS, now = Date.now(), opts = {}) {
  if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) return 0;
  const {
    isActive = (name) => containerHasActivity(name, SANDBOX_IDLE_MS, now),
    hardMaxMs = maxLifetimeMs * 3,
    processStartedMs: startedMs = processStartedMs,
    docker = createDockerClient(env),
  } = opts;
  pruneActivity(SANDBOX_IDLE_MS, now);
  const managed = await docker.listManaged();
  let reaped = 0;
  for (const container of managed) {
    const name = (container.Names?.[0] || '').replace(/^\//, '');
    const snapshot = { running: container.State === 'running', createdSec: Number(container.Created ?? 0) };
    const active = isActive(name);
    if (shouldReapSandbox(snapshot, now, maxLifetimeMs, hardMaxMs, active) || isIdleExpired(snapshot, now, SANDBOX_IDLE_MS, active, startedMs)) {
      await docker.stop(name).catch(() => {});
      reaped += 1;
    }
  }
  return reaped;
}

/** Starts the max-lifetime reaper (#16). reapExpiredSandboxes self-gates, so scheduling is always
 *  safe; the interval is unref()ed so it never keeps the process alive, and a failed sweep is
 *  logged, not thrown (a transient docker-ide outage must not crash the process). Called from the
 *  runtime entries, not the server factories, so test-built servers spawn no background interval.
 *  Ponytail: a sweep still running when the next tick fires overlaps it; sweeps only stop
 *  containers, so the overlap is wasted work, not a wrong result. */
export function scheduleSandboxReaper(env = process.env, log = console) {
  const intervalMs = Number(env.OSIONOS_IDE_REAP_INTERVAL_MS) || SWEEP_INTERVAL_MS;
  return setInterval(() => {
    reapExpiredSandboxes(env)
      .then((n) => { if (n > 0) log.info(`[osionos-bridge] reaped ${n} expired IDE sandbox(es)`); })
      .catch((error) => log.warn('[osionos-bridge] sandbox reap failed:', error?.message ?? error));
  }, intervalMs).unref();
}
