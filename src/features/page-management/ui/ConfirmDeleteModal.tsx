import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  subPageCount?: number;
}

/**
 * A centered, fixed-position modal that asks for move-to-trash confirmation.
 * Follows Notion's style: clean overlay, centered card, clear action.
 */
export const ConfirmDeleteModal: React.FC<Props> = ({
  onConfirm,
  onCancel,
  title = "this page",
  subPageCount = 0,
}) => {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] bg-[var(--color-backdrop)] backdrop-blur-sm"
        aria-label="Close move-to-trash confirmation"
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
              <h3 className="text-sm font-semibold">Move to Trash</h3>
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
            {subPageCount > 0 ? (
              <div className="bg-[var(--color-text-danger)]/10 border border-[var(--color-text-danger)]/20 rounded p-3 mb-2">
                <p className="text-sm text-[var(--color-text-danger)] font-medium leading-relaxed">
                  This page contains {subPageCount} sub-page
                  {subPageCount > 1 ? "s" : ""}. Moving it to trash will also
                  move all its sub-pages. You can restore them later from trash.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-ink)] leading-relaxed">
                Move <span className="font-semibold italic">{title}</span> to
                trash? You can restore it later from the trash.
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
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
            >
              Move to Trash
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
