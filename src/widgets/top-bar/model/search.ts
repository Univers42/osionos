/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   search.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import { api, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { PaletteCommand } from "./commands";

export interface PaletteResult {
  id: string;
  title: string;
  subtitle?: string;
  accelerator?: string;
  kind: "page" | "command" | "person";
  run: () => void;
}

/** Prefix matches outrank substring matches; -1 = no match. */
function score(title: string, query: string): number {
  const index = title.toLowerCase().indexOf(query);
  if (index < 0) return -1;
  return index === 0 ? 2 : 1;
}

/**
 * Client-side page search over the already-loaded store for the active
 * workspace — instant, zero-backend. P3/P4 swap this for the bridge/vector
 * endpoint behind the same PaletteResult shape.
 */
export function searchPages(query: string, limit = 8): PaletteResult[] {
  const trimmed = query.trim().toLowerCase();
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  if (!workspaceId || !trimmed) return [];
  return usePageStore.getState().pagesForWorkspace(workspaceId)
    .filter((page) => !page.archivedAt)
    .map((page) => ({ page, rank: score(page.title || "Untitled", trimmed) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => b.rank - a.rank || (b.page.updatedAt ?? "").localeCompare(a.page.updatedAt ?? ""))
    .slice(0, limit)
    .map((entry) => ({
      id: entry.page._id,
      title: entry.page.title || "Untitled",
      kind: "page" as const,
      run: () => useWorkspaceLayout.getState().openTab(pageEntryToTab(entry.page)),
    }));
}

/**
 * Server-side page search via the bridge — searches ALL pages in the workspace
 * (incl. deeply nested children + content), not just the client-loaded subset.
 * This is why the in-memory `searchPages` alone could only see loaded roots.
 */
export async function searchPagesRemote(query: string, limit = 12): Promise<PaletteResult[]> {
  const trimmed = query.trim();
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  if (!workspaceId || !trimmed) return [];
  const params = new URLSearchParams({ workspaceId, q: trimmed, limit: String(limit) });
  const entries = await api.get<PageEntry[]>(`/api/pages/search?${params.toString()}`, getActivePageJwt() ?? undefined);
  return (entries ?? []).map((entry) => ({
    id: entry._id,
    title: entry.title || "Untitled",
    kind: "page" as const,
    run: () => useWorkspaceLayout.getState().openTab(pageEntryToTab(entry)),
  }));
}

/** Filter the flattened command registry for '>' command mode. */
export function matchCommands(query: string, commands: PaletteCommand[], limit = 12): PaletteResult[] {
  const trimmed = query.trim().toLowerCase();
  const matched = trimmed
    ? commands.filter((command) => command.label.toLowerCase().includes(trimmed))
    : commands;
  return matched.slice(0, limit).map((command) => ({
    id: command.id,
    title: command.label,
    subtitle: command.group,
    accelerator: command.accelerator,
    kind: "command" as const,
    run: command.run,
  }));
}
