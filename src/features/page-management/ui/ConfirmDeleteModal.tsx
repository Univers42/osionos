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
        className="fixed inset-0 z-[100] bg-[var(--color-backdrop)] backdrop-blur-sm"
        aria-label="Close confirmation"
        onClick={onCancel}
      />
      <div
        className="fixed inset-0 z-[100]"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          className="w-full max-w-[400px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200"
          style={{ pointerEvents: "auto" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 text-[var(--color-text-danger)]">
              <AlertTriangle size={18} />
              <h3 className="text-sm font-semibold">{modalTitle}</h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-faint)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-5">
            {!isDelete && subPageCount > 0 ? (
              <div className="bg-[var(--color-text-danger)]/10 border border-[var(--color-text-danger)]/20 rounded p-3 mb-2">
                <p className="text-sm text-[var(--color-text-danger)] font-medium leading-relaxed">
                  This page contains {subPageCount} sub-page
                  {subPageCount > 1 ? "s" : ""}. Archiving it will also archive
                  all its sub-pages. You can restore them later from Archived
                  files.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-ink)] leading-relaxed">
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
              <p className="mt-2 text-sm text-[var(--color-ink)] leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 bg-[var(--color-surface-hover)]/30 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={[
                "px-3 py-1.5 text-xs font-medium rounded shadow-sm transition-colors",
                isDelete
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-[var(--color-ink)] hover:opacity-90 text-[var(--color-surface)]",
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
