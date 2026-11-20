/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   applyTarget.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure target check for "apply to this page": decides BEFORE any template
// loads whether the caller has a page to apply to and may write its body, so
// the panel can disable the control and the apply flow can refuse with a
// message. No store, no React — the live caller passes its own `canEdit`.

import type { ActivePage, PageEntry } from "@/entities/page";
import type { ApplyFailure } from "./applyToPage";

export type ApplyTarget =
  | { ok: true; pageId: string; empty: boolean }
  | { ok: false; reason: "no-page" | "read-only" };

/** A target exists only for an open `kind: "page"` whose entry is loaded; the
 *  empty flag then decides whether the caller needs to ask before replacing. */
export function applyTargetFor(
  active: ActivePage | null,
  page: PageEntry | undefined,
  canEdit: (page: PageEntry) => boolean,
): ApplyTarget {
  if (!active || active.kind !== "page" || !page) return { ok: false, reason: "no-page" };
  if (!canEdit(page)) return { ok: false, reason: "read-only" };
  return { ok: true, pageId: page._id, empty: (page.content ?? []).length === 0 };
}

/** One plain sentence per apply failure, for a toast. A failure that already
 *  made a copy says so, so the user knows where their content went. */
const FAILURE_TEXT: Record<ApplyFailure, string> = {
  "read-only": "This page cannot be edited right now.",
  "not-loaded": "The page's content has not loaded yet.",
  "db-read-only": "The databases cannot be written right now.",
  "dangling-database": "The template's databases could not be cloned safely.",
  "not-open": "The page is no longer open.",
  "copy-failed": "The copy could not be created.",
  "changed-during-copy": "The page changed while the copy was being made.",
  "commit-failed": "The databases could not be updated.",
};

export function applyFailureText(reason: ApplyFailure, copyKept: boolean): string {
  const sentence = FAILURE_TEXT[reason];
  return copyKept ? `${sentence} Your copy was kept.` : sentence;
}
