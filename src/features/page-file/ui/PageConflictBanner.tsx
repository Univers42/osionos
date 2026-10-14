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

import { usePageStore } from "@/store/usePageStore";
import { canEditPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { useIdeSyncConflicts } from "@/features/ide/model/ideSyncConflicts";

import type { ConflictResult } from "../model/pageConflictResolve";

const READ_ONLY = "Read-only: you can't edit this page";
const BTN = "shrink-0 rounded border border-[var(--osio-code-border,var(--osio-border-default))] " +
  "px-2 py-0.5 text-[var(--osio-code-fg,var(--osio-fg-default))] " +
  "hover:bg-[var(--osio-code-btn-hover,var(--osio-bg-hover))] disabled:opacity-50";

/** The block page's half of the divergence banner: the page kept your content, the file moved
 *  on, and only you can pick a side (ADR-001 §7). It subscribes to the conflict and to one
 *  boolean — never to the page object, whose identity changes on every keystroke. */
export const PageConflictBanner: React.FC<{ pageId: string }> = ({ pageId }) => {
  const conflict = useIdeSyncConflicts((s) => s.byPageId[pageId]);
  const canEdit = usePageStore((s) => {
    const page = s.pageById(pageId);
    return page !== undefined && canEditPage(page, getCurrentPageAccessContext());
  });
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
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center gap-2 border-b border-[var(--osio-code-border,var(--osio-border-default))] bg-[var(--osio-code-header-bg,var(--osio-bg-subtle))] px-3 py-1.5 text-[12px] text-[var(--osio-code-fg,var(--osio-fg-default))]"
    >
      <span className="min-w-0 flex-1 truncate text-[var(--osio-warning)]">
        The file version of this page changed too.
      </span>
      {!canEdit && <span className="shrink-0 text-[var(--osio-fg-muted)]">{READ_ONLY}</span>}
      {error !== null && (
        <span className="max-w-[45%] shrink-0 truncate text-[var(--osio-danger)]" title={error}>
          {error}
        </span>
      )}
      <button type="button" onClick={() => void act("keep")} disabled={busy !== null} aria-busy={busy !== null} className={BTN}>
        Keep mine
      </button>
      <button
        type="button"
        onClick={() => void act("take")}
        disabled={busy !== null || !canEdit}
        aria-busy={busy !== null}
        title={canEdit ? undefined : READ_ONLY}
        className={BTN}
      >
        Take file
      </button>
    </div>
  );
};
