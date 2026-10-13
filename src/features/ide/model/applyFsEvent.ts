/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   applyFsEvent.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { usePageStore } from "@/store/usePageStore";

import { resolveFacadePath } from "../vfs/pageProvider";
import { sanitizeSegment } from "./idePaths";
import { isEchoHash, sha16, type FsEvent } from "./ideFsEcho";
import { decodeUtf8Strict, isEchoAt } from "./inboundPipeline";
import { decideInboundWrite, recordSyncedHash, clearSyncedHash, syncedHashOf } from "./ideSyncEngine";
import { useIdeSyncConflicts } from "./ideSyncConflicts";
import { materializeWorkspace } from "./materialize";
import { pageStoreFacade } from "./pageStoreFacade";
import { ideOutput } from "./ideOutputBus";

/** Normalize a container path to the sanitized segment form pages use. */
function sanitizeRel(path: string): string[] {
  return path.split("/").filter(Boolean).map(sanitizeSegment);
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
  const theirs = decodeUtf8Strict(evt.content);
  if (theirs === null) {
    ideOutput("fs-sync", `skipped ${evt.path}: not UTF-8 text`);
    return;
  }
  const entry = resolveFacadePath(facade, segments);
  const localContent = entry && entry.kind === "file" ? await facade.readContent(entry.id) : entry ? "" : null;

  const decision = decideInboundWrite({
    inboundHash: evt.hash ?? null,
    isEcho: (h) => isEchoAt(h, syncedHashOf(workspaceId, relPath), isEchoHash),
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
