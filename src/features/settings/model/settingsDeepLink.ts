/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsDeepLink.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The ?settings=<section>#<anchor> deep link. The section must be a registry
// id and the anchor must be one of ITS anchors: a link that names anything
// else opens nothing rather than a wrong panel. Applying the link drops it
// from the URL, so a reload does not reopen it on top of the restored layout.

import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import { findSection, type SettingsSectionId } from "./sections";
import { openSettings } from "./settingsNav";

export interface SettingsDeepLink {
  section: SettingsSectionId;
  /** Only set when the anchor belongs to the section. */
  anchor?: string;
}

/** The parts of a URL a settings deep link is read from. */
export interface SettingsLinkLocation {
  search: string;
  hash: string;
}

/** The hash as an anchor id. A malformed escape is not a throw: it is simply
 *  not an anchor. */
function anchorIdFromHash(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The settings a link asks for, or null when it asks for nothing that
 *  exists. An anchor of another section is dropped, not honoured. */
export function readSettingsDeepLink(location: SettingsLinkLocation): SettingsDeepLink | null {
  const requested = new URLSearchParams(location.search).get("settings");
  if (!requested) return null;
  const section = findSection(requested);
  if (!section) return null;
  const anchor = anchorIdFromHash(location.hash);
  if (!anchor) return { section: section.id };
  const owns = section.anchors.some((candidate) => candidate.id === anchor);
  return owns ? { section: section.id, anchor } : { section: section.id };
}

/** Drop the settings param and the hash, keeping every other param. */
function clearSettingsDeepLink(): void {
  const { pathname, search } = globalThis.location;
  const params = new URLSearchParams(search);
  params.delete("settings");
  const query = params.toString();
  globalThis.history.replaceState(globalThis.history.state, "", `${pathname}${query ? `?${query}` : ""}`);
}

/** The layout tree is REPLACED when the signed-in identity restores its tabs,
 *  so the link opens its tab after that restore: opened before it, the restore
 *  would drop the tab again.
 *  Caveat: the link waits for a signed-in identity — a session that never
 *  resolves never opens the tab, and the link stays in the URL. */
function whenLayoutIsRestored(run: () => void): void {
  if (useWorkspaceLayout.getState().scope) {
    run();
    return;
  }
  const unsubscribe = useWorkspaceLayout.subscribe((state, previous) => {
    if (!state.scope || previous.scope) return;
    unsubscribe();
    run();
  });
}

/** Open the settings tab a ?settings= link asks for, then drop the link from
 *  the URL. A link that names nothing that exists opens nothing. */
export function applySettingsDeepLink(): void {
  const location = globalThis.location as SettingsLinkLocation | undefined;
  if (!location) return;
  const link = readSettingsDeepLink(location);
  if (!link) return;
  whenLayoutIsRestored(() => {
    openSettings(link.section, link.anchor);
    clearSettingsDeepLink();
  });
}
