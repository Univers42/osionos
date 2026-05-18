/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConfirmDialog.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:21 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertTriangle, X } from "lucide-react";

import { cx } from "../../shared/classNames";

export type ConfirmDialogTone = "default" | "danger";
export type ConfirmDialogActionTone = "primary" | "danger";

export interface ConfirmDialogProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  tone?: ConfirmDialogTone;
  actionTone?: ConfirmDialogActionTone;
  onCancel: () => void;
  onConfirm: () => void;
}

const ACTION_CLASS: Record<ConfirmDialogActionTone, string> = {
  primary: "bg-[var(--osio-fg-default)] text-[var(--osio-bg-surface)] hover:opacity-90",
  danger: "bg-[var(--osio-danger)] text-[var(--osio-danger-fg)] hover:bg-[var(--osio-danger-hover)]",
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  children,
  cancelLabel = "Cancel",
  confirmLabel,
  tone = "default",
  actionTone = "primary",
  onCancel,
  onConfirm,
}) => (
  <>
    <button
      type="button"
      className="fixed inset-0 z-[var(--osio-z-modal)] bg-[var(--osio-overlay)] backdrop-blur-sm"
      aria-label="Close confirmation"
      onClick={onCancel}
    />
    <div
      className="fixed inset-0 z-[var(--osio-z-modal)] flex items-center justify-center p-4"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="w-full max-w-[400px] animate-in overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-xl fade-in zoom-in duration-200"
        style={{ pointerEvents: "auto" }}
      >
        <div className="flex items-center justify-between border-b border-[var(--osio-border-default)] px-4 py-3">
          <div className={cx("flex items-center gap-2", tone === "danger" ? "text-[var(--osio-danger)]" : "text-[var(--osio-fg-default)]")}>
            <AlertTriangle size={18} />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-[var(--osio-fg-subtle)] transition-colors hover:bg-[var(--osio-bg-hover)]"
            aria-label="Close confirmation"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-5">{children}</div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--osio-border-default)] bg-[var(--osio-bg-hover)]/30 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[var(--osio-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cx("rounded px-3 py-1.5 text-xs font-medium shadow-sm transition-colors", ACTION_CLASS[actionTone])}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  </>
);
