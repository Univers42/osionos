/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   visibilityActions.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Lock, Users } from "lucide-react";
import type { PageEntry, PageVisibility } from "@/entities/page";
import {
  canChangePageVisibility,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import type { MenuActionCtx, PageMenuAction } from "../types";

/** O(n) in the workspace's page count. */
function hasChildPages(page: PageEntry, allPages: PageEntry[]): boolean {
  return allPages.some((p) => p.parentPageId === page._id);
}

/** Patch `page` to `target` visibility, verify the store took it, and toast
 *  the outcome. Read back through a fresh getState(): the store may refuse the
 *  patch and keep the old visibility, which is the only honest failure signal
 *  we have. O(n) in the workspace's page count (the child check). */
function applyVisibility(ctx: MenuActionCtx, target: PageVisibility, done: string): void {
  ctx.store.getState().patchPage(ctx.page._id, { visibility: target });
  const applied = ctx.store.getState().pageById(ctx.page._id)?.visibility === target;
  const title = ctx.page.title;
  const base = applied
    ? `“${title}” ${done}`
    : `Couldn't change who can see “${title}”.`;
  const hasChildren = applied && hasChildPages(ctx.page, ctx.workspacePages());
  ctx.toast({
    kind: applied ? "success" : "error",
    title: hasChildren ? `${base} Sub-pages keep their own visibility.` : base,
  });
}

/** Owner-only visibility flips. Publishing (public) is a separate owner flow,
 *  so these actions never unpublish and stay disabled on public pages. */
export const VISIBILITY_ACTIONS: PageMenuAction[] = [
  {
    id: "make-private",
    label: "Make private",
    icon: Lock,
    section: "share",
    scope: "both",
    enabled: (ctx) =>
      canChangePageVisibility(ctx.page, getCurrentPageAccessContext()) &&
      ctx.page.visibility !== "public" &&
      (ctx.page.visibility ?? "private") !== "private",
    run: (ctx) => applyVisibility(ctx, "private", "is now private"),
  },
  {
    id: "share-with-workspace",
    label: "Share with workspace",
    icon: Users,
    section: "share",
    scope: "both",
    enabled: (ctx) =>
      canChangePageVisibility(ctx.page, getCurrentPageAccessContext()) &&
      ctx.page.visibility !== "public" &&
      ctx.page.visibility !== "shared",
    run: (ctx) => applyVisibility(ctx, "shared", "is now shared with the workspace"),
  },
];
