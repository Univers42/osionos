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

import React from "react";
import { ConfirmDialog } from "@/shared/ui/molecules/ConfirmDialog";

type ConfirmActionVariant = "archive" | "delete";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ConfirmActionVariant;
  pageTitle?: string;
  subPageCount?: number;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
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
}) => {
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
      onConfirm={onConfirm}
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
    </ConfirmDialog>
  );
};
