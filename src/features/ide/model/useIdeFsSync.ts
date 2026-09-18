/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIdeFsSync.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { resolveFacadePath } from "../vfs/pageProvider";
import { ideWsProtocols } from "./useIdeTerminal";
import { sanitizeSegment } from "./idePaths";
import { parseFsEvent, isEchoHash, sha16, type FsEvent } from "./ideFsEcho";
import { publishFsEvent } from "./ideFsEvents";
import { ideOutput } from "./ideOutputBus";
import { decideInboundWrite, recordSyncedHash, clearSyncedHash, syncedHashOf } from "./ideSyncEngine";
import { useIdeSyncConflicts } from "./ideSyncConflicts";
import { materializeWorkspace } from "./materialize";
import { pageStoreFacade } from "./pageStoreFacade";
import { createReconnectBackoff } from "./reconnectBackoff";
import { usePageStore } from "@/store/usePageStore";

/** Normalize a container path to the sanitized segment form pages use. */
function sanitizeRel(path: string): string[] {
  return path.split("/").filter(Boolean).map(sanitizeSegment);
}

function decodeBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Create the page for `segments`, materializing missing ancestor folders —
 *  all through the SAME facade the osionos:// provider uses. */
async function createWithAncestors(
  facade: ReturnType<typeof pageStoreFacade>,
  segments: string[],
  content: string,
): Promise<void> {
  let parentId: string | null = null;
  for (let depth = 0; depth < segments.length - 1; depth++) {
    const existing = resolveFacadePath(facade, segments.slice(0, depth + 1));
    if (existing?.kind === "dir") {
      parentId = existing.id;
      continue;
    }
    if (existing) return; // a FILE occupies the folder path — never overwrite
    const created = await facade.create({ title: segments[depth], parentId, kind: "dir" });
    parentId = created.id;
  }
  await facade.create({ title: segments[segments.length - 1], parentId, kind: "file", content });
}

/** Apply one fs-agent event to the canonical page store — through the VFS
 *  facade + the three-way sync engine. Conflicts are SURFACED (the page keeps
 *  the local content; the sandbox version is held for one-click resolution),
 *  never silently last-writer-wins. */
export async function applyFsEvent(evt: FsEvent, workspaceId: string): Promise<void> {
  const facade = pageStoreFacade(workspaceId);

  if (evt.event === "ready") {
    const { written, failed } = await materializeWorkspace(workspaceId, usePageStore.getState().pages[workspaceId] ?? []);
    ideOutput("fs-sync", `sandbox attached — materialized ${written} files${failed > 0 ? `, ${failed} FAILED` : ""}`);
    if (failed > 0) console.warn(`[ide] materialize: ${failed} of ${written + failed} files failed to reach the sandbox`);
    return;
  }

  const segments = sanitizeRel(evt.path);
  if (segments.length === 0) return;
  const relPath = segments.join("/");

  if (evt.event === "delete") {
    const entry = resolveFacadePath(facade, segments);
    if (entry) await facade.archive(entry.id);
    clearSyncedHash(workspaceId, relPath);
    return;
  }

  if (evt.event !== "write" || evt.content == null) return; // binary/oversized — no content
  const theirs = decodeBase64(evt.content);
  const entry = resolveFacadePath(facade, segments);
  const localContent = entry && entry.kind === "file" ? await facade.readContent(entry.id) : entry ? "" : null;

  const decision = decideInboundWrite({
    inboundHash: evt.hash ?? null,
    isEcho: isEchoHash,
    localContent,
    localHash: localContent === null ? null : await sha16(localContent),
    inboundContent: theirs,
    lastSyncedHash: syncedHashOf(workspaceId, relPath),
  });

  if (decision.action === "echo") {
    // Our own write confirmed by the agent — this IS the new agreed state.
    if (evt.hash) recordSyncedHash(workspaceId, relPath, evt.hash);
    return;
  }
  if (decision.action === "ignore") {
    recordSyncedHash(workspaceId, relPath, evt.hash ?? (await sha16(theirs)));
    return;
  }
  if (decision.action === "create") {
    await createWithAncestors(facade, segments, theirs);
    recordSyncedHash(workspaceId, relPath, evt.hash ?? (await sha16(theirs)));
    return;
  }
  if (decision.action === "apply") {
    if (entry && entry.kind === "file") await facade.writeContent(entry.id, theirs);
    recordSyncedHash(workspaceId, relPath, evt.hash ?? (await sha16(theirs)));
    return;
  }
  if (entry) {
    useIdeSyncConflicts.getState().report({
      relPath, pageId: entry.id, theirs,
      theirsHash: evt.hash ?? (await sha16(theirs)), atMs: Date.now(),
    });
    ideOutput("sync", `CONFLICT: ${relPath} changed on both sides — open the file to resolve`);
  }
}

/**
 * Live writeback (P4): streams the in-sandbox fs-agent's events, PUBLISHES them
 * on the per-workspace bus (the sandbox:// provider's watch() rides the same
 * socket), and maps them onto the page mount via the sync engine. On "ready"
 * it materializes the tree. Auto-reconnects with 1s/4s/15s backoff (reconnectBackoff).
 */
export function useIdeFsSync(workspaceId: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !workspaceId || !API_BASE) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const backoff = createReconnectBackoff();

    const connect = () => {
      const jwt = getActivePageJwt() ?? "";
      if (disposed || !jwt) return;
      const wsBase = API_BASE.replace(/^http/, "ws"); // http→ws, https→wss
      ws = new WebSocket(`${wsBase}/api/ide/fsync?workspaceId=${encodeURIComponent(workspaceId)}`, ideWsProtocols(jwt));
      ws.binaryType = "arraybuffer";

      let buffer = "";
      ws.onmessage = (ev) => {
        backoff.delivered();
        buffer += typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const evt = parseFsEvent(line);
          if (!evt) continue;
          publishFsEvent(workspaceId, evt);
          void applyFsEvent(evt, workspaceId);
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        const delayMs = backoff.next();
        ideOutput("fs-sync", `disconnected — reconnecting in ${delayMs / 1000}s`);
        console.warn(`[ide] fs sync disconnected — reconnecting in ${delayMs / 1000}s`);
        timer = setTimeout(connect, delayMs);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      try { ws?.close(); } catch { /* already closed */ }
    };
  }, [workspaceId, enabled]);
}
