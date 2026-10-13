/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceMounts.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#+    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createMountTable } from "./mountTable";
import { createPageProvider } from "./pageProvider";
import { createSandboxProvider } from "./sandboxProvider";
import { bridgeFsTransport } from "./bridgeTransport";
import { pageFileFacade } from "@/features/page-file/model/pageFileFacadeStore";
import { useSandboxHealthStore, isSandboxOnline } from "@/features/ide/model/sandboxHealthStore";
import type { MountTable, FsProvider } from "./types";

/** The one scheme every workbench consumer resolves: `workspace://<workspaceId>/<path>`. */
export const WORKSPACE_SCHEME = "workspace";

/** `workspace://<ws>/<rel>` with each segment URI-encoded (vpath.buildVPath form). */
export function workspaceUri(workspaceId: string, relPath: string): string {
  const segments = relPath.split("/").filter(Boolean).map((s) => encodeURIComponent(s));
  return `${WORKSPACE_SCHEME}://${workspaceId}/${segments.join("/")}`;
}

/** The sandbox is this workspace's backend only while the health snapshot is
 *  "online" AND names this workspace — a snapshot for another workspace (or a
 *  stale one) must not hand the workspace's tree to a foreign sandbox. */
function isOnlineHere(workspaceId: string): boolean {
  const health = useSandboxHealthStore.getState();
  return isSandboxOnline(health.state) && health.workspaceId === workspaceId;
}

interface SwitchingWatch {
  workspaceId: string;
  current: () => FsProvider;
  path: Parameters<FsProvider["watch"]>[0];
  onEvent: Parameters<FsProvider["watch"]>[1];
  signal: AbortSignal;
}

/** Each backend's watch resolves only on abort, so a flip needs an inner controller:
 *  aborting it ends the old backend's watch and the loop re-establishes on the new one.
 *  lastOnline is per watch: the shared `online` is advanced by ANY call to current(),
 *  which could hide the flip. A rejecting backend watch ends this watch with its error;
 *  the health subscription and the caller's abort listener are released either way. */
function switchingWatch({ workspaceId, current, path, onEvent, signal }: SwitchingWatch): Promise<void> {
  let inner: AbortController | null = null;
  let stopped = false;
  let lastOnline = isOnlineHere(workspaceId);
  const unsubHealth = useSandboxHealthStore.subscribe(() => {
    const nowOnline = isOnlineHere(workspaceId);
    if (stopped || nowOnline === lastOnline) return;
    lastOnline = nowOnline;
    inner?.abort();
  });
  const end = (): void => {
    if (stopped) return;
    stopped = true;
    inner?.abort();
    unsubHealth();
    signal.removeEventListener("abort", onAbort);
  };
  function onAbort(): void { end(); }
  const run = async (): Promise<void> => {
    while (!stopped) {
      inner = new AbortController();
      await current().watch(path, onEvent, inner.signal);
    }
  };
  if (signal.aborted) {
    end();
    return Promise.resolve();
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return run().finally(end);
}

/** Stable provider that delegates each call to the current backend (sandbox or page-file). */
function createSwitchingProvider(workspaceId: string): FsProvider {
  let backend: FsProvider | null = null;
  let online: boolean | null = null;

  const current = (): FsProvider => {
    const now = isOnlineHere(workspaceId);
    if (backend === null || now !== online) {
      backend = now
        ? createSandboxProvider(WORKSPACE_SCHEME, bridgeFsTransport(workspaceId))
        : createPageProvider(WORKSPACE_SCHEME, pageFileFacade(workspaceId));
      online = now;
    }
    return backend;
  };

  // Ponytail: a flip mid-operation (an operation that started on one backend
  // finishes there) — the backend reference is captured at call start, so a
  // read that began on the sandbox completes on the sandbox even if the
  // sandbox dies before it resolves.
  const delegate = <T,>(fn: (backend: FsProvider) => Promise<T>): Promise<T> => {
    const active = current();
    return fn(active);
  };

  return {
    get scheme() {
      return WORKSPACE_SCHEME;
    },
    capabilities() {
      return current().capabilities();
    },
    stat: (path, signal) => delegate((b) => b.stat(path, signal)),
    list: (path, signal) => delegate((b) => b.list(path, signal)),
    read: (path, opts) => delegate((b) => b.read(path, opts)),
    write: (path, data, opts) => delegate((b) => b.write(path, data, opts)),
    mkdir: (path, signal) => delegate((b) => b.mkdir(path, signal)),
    delete: (path, opts) => delegate((b) => b.delete(path, opts)),
    rename: (from, to, opts) => delegate((b) => b.rename(from, to, opts)),
    watch: (path, onEvent, signal) => switchingWatch({ workspaceId, current, path, onEvent, signal }),
    async close() {
      if (backend !== null) {
        await backend.close();
        backend = null;
        online = null;
      }
    },
  };
}

/**
 * Mount table for one workspace. Mounts ONE stable provider object at
 * `workspace://<ws>` that delegates each call to the current backend: the sandbox
 * provider while the sandbox is online for this workspace, else the page-file
 * provider over `pageFileFacade(ws)`.
 */
export function getWorkspaceMounts(workspaceId: string): MountTable {
  const table = createMountTable();
  const provider = createSwitchingProvider(workspaceId);
  table.mount(WORKSPACE_SCHEME, workspaceId, provider);
  return table;
}

/** Called when `workspace://<ws>` backend flips (sandbox online ↔ degraded). Returns unsubscribe. */
export function subscribeWorkspaceMounts(workspaceId: string, onChange: () => void): () => void {
  // Seeded now, not from the first event: that first event may BE the flip.
  let lastOnline = isOnlineHere(workspaceId);
  return useSandboxHealthStore.subscribe((snap) => {
    const online = isSandboxOnline(snap.state) && snap.workspaceId === workspaceId;
    if (online !== lastOnline) {
      lastOnline = online;
      onChange();
    }
  });
}
