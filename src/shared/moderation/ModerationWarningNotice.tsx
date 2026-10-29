/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModerationWarningNotice.tsx                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * L0's warning, as the author sees it: what may hurt someone, the words that
 * tripped a rule, and the two answers — Edit, or go ahead anyway.
 *
 * ONE notice for every surface that writes public text (a comment, a published
 * page, a marketplace app, a community): the markup, the classes and the words
 * are the same everywhere, so the author learns the answer once.
 *
 * The notice itself says nothing about how to answer: `onEdit` and `onConfirm`
 * are the surface's own, and `confirmLabel` names the go-ahead in the
 * surface's words ("Post anyway", "Publish anyway", "Create anyway").
 *
 * The screen that shows it owns the `aria-live` wrapper: the warning is
 * announced, not shouted.
 */

import React from "react";

import type { ModerationWarning } from "./moderationWarning";

interface Props {
  /** What L0 answered. */
  warning: ModerationWarning;
  /** The author edits the text instead of going ahead. */
  onEdit: () => void;
  /** The author goes ahead: the write is sent again with the answer. */
  onConfirm: () => void;
  /** What going ahead says here: "Post anyway", "Publish anyway", "Create anyway". */
  confirmLabel: string;
}

/** The warning notice, shared by every surface L0 can ask on. */
export const ModerationWarningNotice: React.FC<Props> = ({ warning, onEdit, onConfirm, confirmLabel }) => (
  <div className="mb-1.5 rounded-md bg-[var(--osio-bg-hover)] px-2 py-1.5">
    <p className="text-xs text-[var(--osio-fg-default)]">{warning.message}</p>
    {warning.terms.length > 0 && (
      <p className="mt-0.5 text-3xs text-[var(--osio-danger)]">Matched: {warning.terms.join(", ")}</p>
    )}
    <div className="mt-1 flex gap-3">
      <button type="button" onClick={onEdit} className="text-3xs text-[var(--osio-fg-subtle)] hover:text-[var(--osio-accent)]">
        Edit
      </button>
      <button type="button" onClick={onConfirm} className="text-3xs text-[var(--osio-fg-subtle)] hover:text-[var(--osio-accent)]">
        {confirmLabel}
      </button>
    </div>
  </div>
);
