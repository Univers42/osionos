/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConfirmDeleteModal.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:45 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 20:16:47 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertTriangle, X } from "lucide-react";

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

/**
 * A centered, fixed-position modal used to confirm page archive/delete actions.
 */
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
    <>
      <button
        type="button"
        className="fixed inset-0 z-[var(--osio-z-modal)] bg-[var(--osio-overlay)] backdrop-blur-sm"
        aria-label="Close confirmation"
        onClick={onCancel}
      />
      <div
        className="fixed inset-0 z-[var(--osio-z-modal)]"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          className="w-full max-w-[400px] bg-[var(--osio-bg-surface)] border border-[var(--osio-border-default)] rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200"
          style={{ pointerEvents: "auto" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--osio-border-default)]">
            <div className="flex items-center gap-2 text-[var(--osio-danger)]">
              <AlertTriangle size={18} />
              <h3 className="text-sm font-semibold">{modalTitle}</h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 rounded hover:bg-[var(--osio-bg-hover)] text-[var(--osio-fg-subtle)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-5">
            {!isDelete && subPageCount > 0 ? (
              <div className="bg-[var(--osio-danger)]/10 border border-[var(--osio-danger)]/20 rounded p-3 mb-2">
                <p className="text-sm text-[var(--osio-danger)] font-medium leading-relaxed">
                  This page contains {subPageCount} sub-page
                  {subPageCount > 1 ? "s" : ""}. Archiving it will also archive
                  all its sub-pages. You can restore them later from Archived
                  files.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--osio-fg-default)] leading-relaxed">
                {isDelete ? (
                  modalDescription
                ) : (
                  <>
                    Archive{" "}
                    <span className="font-semibold italic">{pageTitle}</span>?
                    You can restore it later from Archived files.
                  </>
                )}
              </p>
            )}
            {!isDelete && description && (
              <p className="mt-2 text-sm text-[var(--osio-fg-default)] leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 bg-[var(--osio-bg-hover)]/30 border-t border-[var(--osio-border-default)]">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--osio-border-default)] hover:bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)] transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={[
                "px-3 py-1.5 text-xs font-medium rounded shadow-sm transition-colors",
                isDelete
                  ? "bg-[var(--osio-danger)] hover:bg-[var(--osio-danger-hover)] text-[var(--osio-danger-fg)]"
                  : "bg-[var(--osio-fg-default)] hover:opacity-90 text-[var(--osio-bg-surface)]",
              ].join(" ")}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
