/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConfirmDeleteModal.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:45 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 01:02:15 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { ConfirmDialog } from "@/shared/ui/molecules/ConfirmDialog";

type ConfirmActionVariant = "archive" | "delete";

interface Props {
  /** `remember` is true when the user ticked "Don't ask again" (only when showRemember). */
  onConfirm: (remember: boolean) => void;
  onCancel: () => void;
  variant?: ConfirmActionVariant;
  pageTitle?: string;
  subPageCount?: number;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Show a "Don't ask again" checkbox (used by the Delete-key quick-delete flow). */
  showRemember?: boolean;
}

export const ConfirmDeleteModal: React.FC<Props> = ({
  onConfirm,
  onCancel,
  variant = "archive",
  pageTitle = "this page",
  subPageCount = 0,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  showRemember = false,
}) => {
  const [remember, setRemember] = useState(false);
  const modalTitle =
    title ?? (variant === "delete" ? "¿Delete permanently?" : "Archive");
  const modalDescription =
    description ??
    (variant === "delete"
      ? "This action can't be undone. All information in this page will be lost."
      : `Archive ${pageTitle}? You can restore it later from Archived files.`);
  const actionLabel =
    confirmLabel ?? (variant === "delete" ? "Delete" : "Archive");
  const isDelete = variant === "delete";

  return (
    <ConfirmDialog
      title={modalTitle}
      tone="danger"
      actionTone={isDelete ? "danger" : "primary"}
      confirmLabel={actionLabel}
      cancelLabel={cancelLabel}
      onConfirm={() => onConfirm(remember)}
      onCancel={onCancel}
    >
      {!isDelete && subPageCount > 0 ? (
        <div className="mb-2 rounded-lg border border-[var(--osio-danger)]/20 bg-[var(--osio-danger)]/10 p-3">
          <p className="text-sm font-medium leading-relaxed text-[var(--osio-danger)]">
            This page contains {subPageCount} sub-page
            {subPageCount > 1 ? "s" : ""}. Archiving it will also archive all
            its sub-pages. You can restore them later from Archived files.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[var(--osio-fg-default)]">
          {isDelete ? (
            modalDescription
          ) : (
            <>
              Archive <span className="font-semibold italic">{pageTitle}</span>?
              You can restore it later from Archived files.
            </>
          )}
        </p>
      )}
      {!isDelete && description ? (
        <p className="mt-2 text-sm leading-relaxed text-[var(--osio-fg-default)]">
          {description}
        </p>
      ) : null}
      {showRemember ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--osio-fg-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.currentTarget.checked)}
            className="accent-[var(--osio-accent)]"
          />
          Don&apos;t ask again
        </label>
      ) : null}
    </ConfirmDialog>
  );
};
