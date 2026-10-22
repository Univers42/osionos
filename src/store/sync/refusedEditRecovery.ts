/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   refusedEditRecovery.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page/model/types";
import type { Block } from "@/entities/block/model/types";

export type RecoveryOutcome = "recovered" | "evicted" | "failed";

/**
 * Why the local edit could not be written where the reader wanted it. The route is the
 * same either way — the edit becomes a copy, the original goes back to the server's
 * version — but the notice says which of the two happened.
 */
export type RecoveryReason = "refused" | "conflict";

export interface RecoveryDeps {
  fetchServerPage(id: string): Promise<PageEntry | "unreadable" | "failed">;
  createCopy(input: {
    workspaceId: string;
    title: string;
    content: Block[];
    icon?: string;
    properties: PageEntry["properties"];
  }): Promise<PageEntry | null>;
  replaceLocalPage(entry: PageEntry): void;
  evictLocalPage(id: string): void;
  notify(toast: { kind: "error" | "warning"; title: string; description: string }): void;
}

// Ponytail: a copy whose 201 is lost in transit is created again on retry — a duplicate copy, never a loss.
/**
 * A 403 on an edit: keep the user's work. The local page (the refused edit) becomes a copy in
 * the private workspace and the original goes back to the server's version; a page the viewer
 * can no longer read is evicted with an error. Never touches the network itself (deps do).
 *
 * The same route serves a conflict (the 409 path): the edit could not be written where the
 * reader wanted it either, and the server's copy must stay untouched.
 */
export async function recoverRefusedEdit(
  page: PageEntry,
  privateWorkspaceId: string | null,
  deps: RecoveryDeps,
  reason: RecoveryReason = "refused",
): Promise<RecoveryOutcome> {
  if (privateWorkspaceId === null) return "failed";
  const server = await deps.fetchServerPage(page._id);
  if (server === "failed") return "failed";
  const title = page.title || "Untitled";
  if (server === "unreadable") {
    deps.evictLocalPage(page._id);
    deps.notify({
      kind: "error",
      title: `Changes to “${title}” were not saved`,
      description: "This page was deleted or is no longer shared with you.",
    });
    return "evicted";
  }
  const copyTitle = `${title} (copy)`;
  const copy = await deps.createCopy({
    workspaceId: privateWorkspaceId,
    title: copyTitle,
    content: page.content ?? [],
    icon: page.icon,
    properties: page.properties ?? [],
  });
  if (copy === null) return "failed";
  deps.replaceLocalPage(server);
  deps.notify({
    kind: "warning",
    title: reason === "conflict"
      ? `Someone else changed “${title}” at the same time`
      : `You can no longer edit “${title}”`,
    description: `Your changes were saved to “${copyTitle}” in your private workspace.`,
  });
  return "recovered";
}
