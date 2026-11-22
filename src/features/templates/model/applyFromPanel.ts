/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   applyFromPanel.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Templates panel's live apply flow: resolve the open page, load the
// template through the ONLY apply path (applyToPageLive), ask before replacing
// anything that exists, and report the outcome as a toast. The catalogue is
// reached by import() so nothing here can reach the boot chunk (TD22).

import { useUserStore } from "@/features/auth";
import { getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { canEditBody } from "@/store/pageStore.helpers";
import { isLayoutModesEnabled } from "@/shared/config/featureFlags";
import { usePageStore } from "@/store/usePageStore";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import type { TemplateSource } from "./templateSlice";
import { applyToPage } from "./applyToPageLive";
import type { ApplyMode, ApplyOutcome } from "./applyToPage";
import { applyFailureText, applyTargetFor, type ApplyTarget } from "./applyTarget";

export type ApplyChoice = ApplyMode | "cancel";
export type ApplyAsk = (titles: { template: string; page: string }) => Promise<ApplyChoice>;

const TARGET_TOAST: Record<"no-page" | "read-only", string> = {
  "no-page": "Open a page to apply a template.",
  "read-only": applyFailureText("read-only", false),
};

function currentTarget(): ApplyTarget {
  const state = usePageStore.getState();
  const active = state.activePage;
  const page = active?.kind === "page" ? state.pageById(active.id) : undefined;
  return applyTargetFor(active, page, (entry) => canEditBody(entry, getCurrentPageAccessContext()));
}

async function loadSource(templateId: string): Promise<TemplateSource | null> {
  const { loadTemplate } = await import("@/data/templates/catalogue");
  return loadTemplate(templateId);
}

function reportOutcome(outcome: ApplyOutcome): void {
  const push = useToastStore.getState().push;
  if (outcome.ok) {
    push({
      kind: "success",
      title: "Template applied",
      description: outcome.copyId ? "A copy of the page is in the sidebar." : undefined,
    });
    return;
  }
  push({ kind: "error", title: applyFailureText(outcome.reason, Boolean(outcome.copyId)) });
}

/** Applies `templateId` to the open page. `ask` decides keep-copy vs replace
 *  (a page with no content is replaced without asking); its "cancel" answer
 *  stops before anything is written. */
export async function applyTemplateToActivePage(templateId: string, ask: ApplyAsk): Promise<void> {
  // The catalogue writes region cells: off with osio.layout.modes (TD18, groot ADR 0067 RD6).
  if (!isLayoutModesEnabled()) return;
  const target = currentTarget();
  if (!target.ok) {
    useToastStore.getState().push({ kind: "error", title: TARGET_TOAST[target.reason] });
    return;
  }
  const source = await loadSource(templateId);
  if (!source) {
    useToastStore.getState().push({ kind: "error", title: "Template unavailable" });
    return;
  }
  const page = usePageStore.getState().pageById(target.pageId);
  const mode = target.empty ? "replace" : await ask({ template: source.title, page: page?.title || "Untitled" });
  if (mode === "cancel") return;
  const userId = useUserStore.getState().activeUserId || "anonymous";
  reportOutcome(await applyToPage(target.pageId, source, mode, userId));
}
