/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageLinkBoot.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { whenLayoutIsRestored } from "@/features/settings/model/settingsDeepLink";
import { openOrDenyPage } from "@/features/page-link/openOrDenyPage";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page id a link asks for, when it is a well-formed UUID; null otherwise. */
export function readPageLink(search: string): string | null {
  const raw = new URLSearchParams(search).get("page");
  if (!raw) return null;
  return UUID_SHAPE.test(raw) ? raw : null;
}

/** The workspace id a link carries, when it is a well-formed UUID; null otherwise. */
export function readPageWorkspace(search: string): string | null {
  const raw = new URLSearchParams(search).get("ws");
  if (!raw) return null;
  return UUID_SHAPE.test(raw) ? raw : null;
}

/** Both halves of a page deep link. */
export function readPageDeepLink(search: string): { pageId: string | null; workspaceId: string | null } {
  return { pageId: readPageLink(search), workspaceId: readPageWorkspace(search) };
}

function dropPageParam(): void {
  const { pathname, search, hash } = globalThis.location;
  const params = new URLSearchParams(search);
  params.delete("page");
  params.delete("ws");
  const query = params.toString();
  globalThis.history.replaceState(globalThis.history.state, "", `${pathname}${query ? `?${query}` : ""}${hash}`);
}

export function applyPageDeepLink(): void {
  const location = globalThis.location as { search?: string } | undefined;
  if (!location) return;
  const params = new URLSearchParams(location.search ?? "");
  if (!params.has("page")) return;
  const linked = readPageLink(location.search ?? "");
  const linkedWorkspace = readPageWorkspace(location.search ?? "");
  // Scrub the params whether or not they are valid.
  dropPageParam();
  if (!linked) return;
  whenLayoutIsRestored(() => {
    openOrDenyPage(linked, linkedWorkspace);
  });
}
