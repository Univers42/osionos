// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-term-sessions.mjs                              :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// Bridge-OWNED terminal sessions (ADR-002): the bridge holds the docker exec
// stream; browser sockets attach and detach. A UI reload therefore reattaches
// to the SAME shell — history, cwd and running process intact — receiving the
// replay ring first. Dependency-free on purpose: bridge-ide-exec and
// bridge-ide-sandbox both import from here, never the reverse (no ESM cycle).
// This module also carries the container ACTIVITY registry the reaper consults.

const RING_CAP_BYTES = 256 * 1024;

/** Bounded replay buffer: whole chunks dropped from the head past the cap —
 *  best-effort recent-output replay, never unbounded growth. */
export function createReplayRing(capBytes = RING_CAP_BYTES) {
  const chunks = [];
  let size = 0;
  return {
    push(chunk) {
      chunks.push(chunk);
      size += chunk.length;
      while (size > capBytes && chunks.length > 1) size -= chunks.shift().length;
    },
    snapshot() {
      return Buffer.concat(chunks);
    },
    get sizeBytes() {
      return size;
    },
  };
}

const sessions = new Map();
const socketsByContainer = new Map();
const lastSocketCloseMsByContainer = new Map();

/** Count a live relay socket (PTY/LSP/fsync) against its container. */
export function bumpContainerSockets(containerName, delta) {
  const next = (socketsByContainer.get(containerName) ?? 0) + delta;
  if (next <= 0) {
    socketsByContainer.delete(containerName);
    if (delta < 0) lastSocketCloseMsByContainer.set(containerName, Date.now());
  } else socketsByContainer.set(containerName, next);
}

/** The reaper's activity signal: a live relay socket, an attached client, or the
 *  last socket/client having closed within `idleMs`. Shell OUTPUT is not activity:
 *  a chatty detached job must not keep its box alive forever.
 *  Caveat: a bridge restart empties this registry (the reaper adds a grace for that). */
export function containerHasActivity(containerName, idleMs, now = Date.now()) {
  if ((socketsByContainer.get(containerName) ?? 0) > 0) return true;
  if (idleMs > 0 && now - (lastSocketCloseMsByContainer.get(containerName) ?? -Infinity) < idleMs) return true;
  for (const session of sessions.values()) {
    if (session.containerName !== containerName || session.ended) continue;
    if (session.clients.size > 0 || now - session.lastActivityMs < idleMs) return true;
  }
  return false;
}

/** Find-or-spawn the session for `key`. `spawn` yields the bridge-held docker
 *  duplex ({ stream, execId }); output fans out to every attached client and
 *  feeds the replay ring. Stream end closes clients with 1000 "process ended". */
export async function getOrCreateSession({ key, containerName, spawn }) {
  const existing = sessions.get(key);
  if (existing && !existing.ended) return existing;
  const { stream, execId } = await spawn();
  const session = {
    key, containerName, execId, stream,
    ring: createReplayRing(), clients: new Set(),
    lastActivityMs: Date.now(), ended: false,
  };
  stream.on("data", (chunk) => {
    session.ring.push(chunk);
    for (const client of session.clients) {
      if (!client.sendBinary(chunk)) stream.pause();
    }
  });
  const end = () => {
    if (session.ended) return;
    session.ended = true;
    sessions.delete(key);
    for (const client of session.clients) client.sendClose(1000, "process ended");
    session.clients.clear();
  };
  stream.on("close", end);
  stream.on("error", end);
  sessions.set(key, session);
  return session;
}

/** Attach a client: replay first, then live. The client shape is minimal so
 *  tests drive it without a real socket: { sendBinary(buf) -> boolean,
 *  sendClose(code, reason), onDrain(fn) }. */
export function attachClient(session, client) {
  const replay = session.ring.snapshot();
  if (replay.length > 0) client.sendBinary(replay);
  session.clients.add(client);
  client.onDrain(() => session.stream.resume());
}

/** Detach WITHOUT killing the shell — a reload reattaches later. */
export function detachClient(session, client) {
  session.clients.delete(client);
  session.lastActivityMs = Date.now();
  session.stream.resume();
}

export function writeStdin(session, data) {
  session.lastActivityMs = Date.now();
  session.stream.write(data);
}

/** Forget close timestamps older than `idleMs`, so the map cannot grow with every box ever seen. */
export function pruneActivity(idleMs, now = Date.now()) {
  for (const [name, closedMs] of lastSocketCloseMsByContainer) {
    if (now - closedMs >= idleMs) lastSocketCloseMsByContainer.delete(name);
  }
}

/** Kill every session whose key starts with `keyPrefix` (a user|container
 *  scope) — wired to DELETE /api/ide/session. */
export function disposeSessionsFor(keyPrefix) {
  let disposed = 0;
  for (const [key, session] of sessions) {
    if (!key.startsWith(keyPrefix)) continue;
    session.ended = true;
    sessions.delete(key);
    for (const client of session.clients) client.sendClose(1000, "session disposed");
    session.clients.clear();
    session.stream.destroy();
    disposed += 1;
  }
  return disposed;
}
