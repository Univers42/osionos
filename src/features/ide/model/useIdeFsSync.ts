/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIdeFsSync.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import type { PageEntry } from "@/entities/page";
import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { ideWsProtocols } from "./useIdeTerminal";
import { usePageStore } from "@/store/usePageStore";
import { codeBlockOf, createCodeFileBlock } from "./codeFile";
import { buildIdeFileTree, flattenIdeTree } from "./ideFileTree";
import { pathForPage, sanitizeSegment } from "./idePaths";
import { parseFsEvent, isEchoHash, type FsEvent } from "./ideFsEcho";
import { materializeWorkspace } from "./materialize";

const resolve = (id: string) => usePageStore.getState().pageById(id);

/** relPath → { pageId, isFolder } for every live IDE page, keyed by the SAME
 *  sanitized path materialize/collectTreeFiles produce (so container paths line
 *  up with page paths). */
function buildRelPathIndex(pages: PageEntry[]): Map<string, { pageId: string; isFolder: boolean }> {
  const map = new Map<string, { pageId: string; isFolder: boolean }>();
  for (const node of flattenIdeTree(buildIdeFileTree(pages))) {
    map.set(pathForPage(node.page._id, resolve), { pageId: node.page._id, isFolder: node.isFolder });
  }
  return map;
}

/** Normalize a container path to the sanitized segment form pages use. */
function sanitizeRel(path: string): string {
  return path.split("/").filter(Boolean).map(sanitizeSegment).join("/");
}

function decodeBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Create a code page for `rel`, materializing any missing folder ancestors as
 *  folder pages first (reuses the ordinary page-store addPage, so it rides the
 *  outbox/ACL/sync like any other page). */
async function createFileWithAncestors(
  rel: string,
  content: string,
  workspaceId: string,
  jwt: string,
  index: Map<string, { pageId: string; isFolder: boolean }>,
): Promise<void> {
  const store = usePageStore.getState();
  const segments = rel.split("/").filter(Boolean);
  if (segments.length === 0) return;
  let parentId: string | undefined;
  for (let i = 0; i < segments.length - 1; i++) {
    const folderPath = segments.slice(0, i + 1).join("/");
    const found = index.get(folderPath);
    if (found?.isFolder) { parentId = found.pageId; continue; }
    const page = await store.addPage(workspaceId, segments[i], jwt, parentId, { surface: "folder" });
    if (!page) return;
    parentId = page._id;
    index.set(folderPath, { pageId: page._id, isFolder: true });
  }
  const leaf = segments[segments.length - 1];
  const page = await store.addPage(workspaceId, leaf, jwt, parentId, {
    surface: "code",
    content: [createCodeFileBlock(leaf, content)],
  });
  if (page) index.set(rel, { pageId: page._id, isFolder: false });
}

/** Apply one fs-agent event to the canonical page store. */
async function applyFsEvent(evt: FsEvent, workspaceId: string): Promise<void> {
  const store = usePageStore.getState();
  const jwt = getActivePageJwt() ?? "";

  if (evt.event === "ready") {
    const { written, failed } = await materializeWorkspace(workspaceId, store.pages[workspaceId] ?? []);
    if (failed > 0) console.warn(`[ide] materialize: ${failed} of ${written + failed} files failed to reach the sandbox`);
    return;
  }

  const rel = sanitizeRel(evt.path);
  if (!rel) return;

  if (evt.event === "delete") {
    const found = buildRelPathIndex(store.pages[workspaceId] ?? []).get(rel);
    if (found) store.archivePage(found.pageId, workspaceId, jwt);
    return;
  }

  if (evt.event === "write") {
    if (evt.hash && isEchoHash(evt.hash)) return; // our own write echoing back
    if (evt.content == null) return; // binary/oversized — fs-agent sent no content
    const content = decodeBase64(evt.content);
    const index = buildRelPathIndex(store.pages[workspaceId] ?? []);
    const found = index.get(rel);
    if (found && !found.isFolder) {
      const block = codeBlockOf(store.pageById(found.pageId));
      if (block && block.content !== content) store.updateBlock(found.pageId, block.id, { content });
    } else if (!found) {
      await createFileWithAncestors(rel, content, workspaceId, jwt, index);
    }
  }
}

/**
 * Live writeback (P4): streams the in-sandbox fs-agent's events and maps them to
 * page CRUD — shell-created files (git pull, codegen) become pages, deletions
 * archive, external edits update the block. The ignore set (in-container) keeps
 * `pip install` from flooding the store; hash echo-suppression keeps our own
 * editor→container writes from looping back. On "ready" it materializes the tree
 * into the fresh sandbox. Mounted once by IdeShell while in IDE mode. A dropped
 * socket auto-reconnects (1s→4s→15s backoff) — a silent sync death left the
 * shell running with no writeback and no indication.
 * ponytail: applyFsEvent is store-coupled glue, exercised live (Part E), not unit
 * tested — the correctness pivots (ignore set, echo hash) are tested elsewhere.
 */
export function useIdeFsSync(workspaceId: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !workspaceId || !API_BASE) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      const jwt = getActivePageJwt() ?? "";
      if (disposed || !jwt) return;
      const wsBase = API_BASE.replace(/^http/, "ws"); // http→ws, https→wss
      ws = new WebSocket(`${wsBase}/api/ide/fsync?workspaceId=${encodeURIComponent(workspaceId)}`, ideWsProtocols(jwt));
      ws.binaryType = "arraybuffer";

      let buffer = "";
      ws.onopen = () => { attempt = 0; };
      ws.onmessage = (ev) => {
        buffer += typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const evt = parseFsEvent(line);
          if (evt) void applyFsEvent(evt, workspaceId);
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        const delayMs = [1000, 4000, 15000][Math.min(attempt, 2)];
        attempt += 1;
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
