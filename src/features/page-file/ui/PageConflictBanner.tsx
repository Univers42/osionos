/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageConflictBanner.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import { canEditPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { useIdeSyncConflicts } from "@/features/ide/model/ideSyncConflicts";

import type { ConflictResult } from "../model/pageConflictResolve";

const READ_ONLY = "Read-only: you can't edit this page";
// The template banner's amber card: the yellow block tint fills it and that tint's ink, at
// 30%, draws the border. The sentence keeps --osio-fg-default, which already reads on the fill.
const CARD = "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--osio-radius-control)] border " +
  "border-[var(--osio-block-tint-yellow-fg)]/30 bg-[var(--osio-block-tint-yellow-bg)] px-3 py-2 " +
  "text-sm text-[var(--osio-fg-default)]";

/** The block page's half of the divergence banner: the page kept your content, the file moved
 *  on, and only you can pick a side (ADR-001 §7). It subscribes to the conflict and to one
 *  boolean — never to the page object, whose identity changes on every keystroke. */
export const PageConflictBanner: React.FC<{ pageId: string }> = ({ pageId }) => {
  const conflict = useIdeSyncConflicts((s) => s.byPageId[pageId]);
  const canEdit = usePageStore((s) => {
    const page = s.pageById(pageId);
    return page !== undefined && canEditPage(page, getCurrentPageAccessContext());
  });
  const readOnlyId = React.useId();
  const [busy, setBusy] = React.useState<"keep" | "take" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const act = React.useCallback(async (which: "keep" | "take") => {
    if (busy !== null) return;
    setBusy(which);
    setError(null);
    // Ponytail: the resolver chunk is fetched on the FIRST click, so that click pays the network
    // latency a static import would have paid at boot; a sandbox with no bridge pays it again.
    // A failed chunk load must still release the buttons, hence the finally.
    try {
      const { keepMine, takeFile, liveConflictDeps } = await import("../model/pageConflictResolve");
      const result: ConflictResult = which === "keep"
        ? await keepMine(pageId, await liveConflictDeps())
        : await takeFile(pageId, await liveConflictDeps());
      if (!result.ok) setError(result.reason);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setBusy(null);
    }
  }, [busy, pageId]);

  if (!conflict) return null;
  return (
    <div className="osionos-page-notice">
      <div role="status" aria-live="polite" className={CARD}>
        <AlertTriangle size={14} aria-hidden className="shrink-0 text-[var(--osio-warning)]" />
        <span className="min-w-[12rem] flex-1">The file version of this page changed too.</span>
        {!canEdit && <span id={readOnlyId} className="text-[var(--osio-fg-muted)]">{READ_ONLY}</span>}
        {error !== null && <span className="min-w-0 break-words text-[var(--osio-danger)]">{error}</span>}
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => void act("keep")} disabled={busy !== null} aria-busy={busy !== null}>
            Keep mine
          </Button>
          <Button
            size="sm"
            tone="danger-subtle"
            onClick={() => void act("take")}
            disabled={busy !== null || !canEdit}
            aria-busy={busy !== null}
            aria-describedby={canEdit ? undefined : readOnlyId}
          >
            Take file
          </Button>
        </div>
      </div>
    </div>
  );
};
