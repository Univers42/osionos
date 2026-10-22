/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-version.fixtures.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The fake bridge the version tests drive: one in-memory server that implements the rule
 * the real bridge implements (scripts/bridge-api.mjs, handlePageUpdate) — a write pinned
 * to a version that has moved is refused with a 409 that carries the server's own copy,
 * and a write that CHANGES the content moves the version by one (the content-scoped
 * trigger, C15). Nothing else: a write that changes no content leaves the version alone.
 */

import { ApiError } from "@osionos/http-gate";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import type { OutboxDeps } from "@/store/sync/pageOutbox";
import type { RecoveryDeps } from "@/store/sync/refusedEditRecovery";

/** A paragraph block. */
export const para = (id: string, text: string): Block => ({ id, type: "paragraph", content: text });

/** A page the outbox can publish. */
export function pageEntry(
  id: string,
  content: Block[],
  overrides: Partial<PageEntry> = {},
): PageEntry {
  return {
    _id: id,
    title: "Plan",
    workspaceId: "ws",
    ownerId: "owner",
    content,
    ...overrides,
  } as PageEntry;
}

/** What the fake server holds for one page. */
export interface ServerPage {
  version: number;
  content: Block[];
}

/** The fake bridge. */
export interface FakeBridge {
  pages: Map<string, ServerPage>;
  /** Every PATCH the server received. */
  patches: Array<{ pageId: string; body: Record<string, unknown> }>;
  /** Every keepalive PATCH, with the status the server answered. */
  keepalives: Array<{ pageId: string; body: Record<string, unknown>; status: number }>;
  /** The pages whose EVERY write is refused — the server that never accepts a version. */
  refuses: Set<string>;
}

export function createBridge(pages: Record<string, ServerPage>): FakeBridge {
  return { pages: new Map(Object.entries(pages)), patches: [], keepalives: [], refuses: new Set() };
}

function pageIdOf(path: string): string {
  return decodeURIComponent(path.replace("/api/pages/", ""));
}

/** The server's answer to one write: the version rule, byte for byte. */
export function applyWrite(
  bridge: FakeBridge,
  pageId: string,
  body: Record<string, unknown>,
): { status: number; body: Record<string, unknown> } {
  const page = bridge.pages.get(pageId);
  if (!page) return { status: 404, body: { ok: false, message: "This page was not found." } };
  const base = body.baseVersion;
  const stale = bridge.refuses.has(pageId) || (typeof base === "number" && base !== page.version);
  if (stale) {
    return {
      status: 409,
      body: {
        ok: false,
        message: "This page changed since you loaded it. Reload it and try again.",
        code: "version_conflict",
        details: { version: page.version, content: page.content },
      },
    };
  }
  if (Array.isArray(body.content)) {
    const next = body.content as Block[];
    // The trigger bumps the version only when the CONTENT changes.
    if (JSON.stringify(next) !== JSON.stringify(page.content)) {
      page.content = next;
      page.version += 1;
    }
  }
  return { status: 200, body: { ok: true, version: page.version } };
}

/** The outbox's bridge calls, driven by the fake server. */
export function bridgeDeps(bridge: FakeBridge, token = "jwt"): OutboxDeps {
  return {
    token: () => token,
    base: () => "http://bridge.test",
    patch: async (path, body) => {
      const pageId = pageIdOf(path);
      bridge.patches.push({ pageId, body });
      const answer = applyWrite(bridge, pageId, body);
      if (answer.status === 200) return answer.body;
      const error = answer.body as { code?: string; details?: unknown };
      throw new ApiError(
        String(error.message ?? "refused"),
        answer.status,
        error.code ?? "API_ERROR",
        error.details,
      );
    },
    keepalive: (path, body) => {
      const pageId = pageIdOf(path);
      const answer = applyWrite(bridge, pageId, body);
      bridge.keepalives.push({ pageId, body, status: answer.status });
    },
  };
}

/** The calls the loss-safe copy path made, and the dependencies that record them. */
export interface RecoveryCalls {
  calls: Array<[string, unknown]>;
  deps: RecoveryDeps;
}

/** The copy path's dependencies, recording every call it makes. */
export function fakeRecovery(
  server: PageEntry | "unreadable" | "failed",
  copy: PageEntry | null,
): RecoveryCalls {
  const calls: Array<[string, unknown]> = [];
  const deps: RecoveryDeps = {
    fetchServerPage: async (id) => { calls.push(["fetchServerPage", id]); return server; },
    createCopy: async (input) => { calls.push(["createCopy", input]); return copy; },
    replaceLocalPage: (entry) => { calls.push(["replaceLocalPage", entry]); },
    evictLocalPage: (id) => { calls.push(["evictLocalPage", id]); },
    notify: (toast) => { calls.push(["notify", toast]); },
  };
  return { calls, deps };
}
