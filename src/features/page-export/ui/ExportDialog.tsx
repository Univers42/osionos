/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExportDialog.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";

import { useUserStore } from "@/features/auth";
import { Modal, Toggle, useToastStore } from "@/shared/ui/primitives";
import { DEFAULT_EXPORT_OPTIONS, type ExportContent, type ExportDbViews, type ExportFormat, type ExportOptions, type ExportStyling } from "../model/exportTypes";
import { runPageExport } from "../model/runExport";
import { ExportSelectRow } from "./ExportSelectRow";

interface ExportDialogProps {
  open: boolean;
  pageId: string;
  workspaceId: string;
  onClose: () => void;
}

const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string }> = [
  { value: "markdown", label: "Markdown & CSV" },
  { value: "html", label: "HTML" },
  { value: "pdf", label: "PDF" },
  { value: "json", label: "JSON" },
];

const STYLE_OPTIONS: ReadonlyArray<{ value: ExportStyling; label: string }> = [
  { value: "styled", label: "Styled" },
  { value: "raw", label: "Raw" },
];

const VIEW_OPTIONS: ReadonlyArray<{ value: ExportDbViews; label: string }> = [
  { value: "current", label: "Current view" },
  { value: "default", label: "Default view" },
];

const CONTENT_OPTIONS: ReadonlyArray<{ value: ExportContent; label: string }> = [
  { value: "everything", label: "Everything" },
  { value: "no_files", label: "Exclude files & images" },
];

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex h-8 items-center justify-between gap-2">
    <span className="text-sm text-[var(--osio-fg-muted)]">{label}</span>
    {children}
  </div>
);

/** Notion-style Export panel: three dropdown rows, two toggles, Cancel/Export. */
export const ExportDialog: React.FC<ExportDialogProps> = ({ open, pageId, workspaceId, onClose }) => {
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const jwt = useUserStore((state) => state.activePageJwt() ?? "");
  const pushToast = useToastStore((state) => state.push);

  const patch = (partial: Partial<ExportOptions>) =>
    setOptions((previous) => ({ ...previous, ...partial }));

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await runPageExport({ pageId, workspaceId, jwt, options });
      pushToast({
        kind: "success",
        title: "Export ready",
        description: result.fileCount > 1
          ? `${result.fileName} — ${result.fileCount} files`
          : result.fileName,
      });
      onClose();
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Export failed",
        description: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export" size="sm">
      <div data-testid="export-dialog" className="w-full space-y-1 text-sm" style={{ maxWidth: 320 }}>
        <ExportSelectRow
          label="Export format"
          value={options.format}
          options={FORMAT_OPTIONS}
          onChange={(format) => patch({ format })}
        />
        <ExportSelectRow
          label="Style"
          value={options.styling}
          options={STYLE_OPTIONS}
          onChange={(styling) => patch({ styling })}
        />
        <ExportSelectRow
          label="Database views"
          value={options.dbViews}
          options={VIEW_OPTIONS}
          onChange={(dbViews) => patch({ dbViews })}
        />
        <ExportSelectRow
          label="Page content"
          value={options.content}
          options={CONTENT_OPTIONS}
          onChange={(content) => patch({ content })}
        />
        <Row label="Include subpages">
          <Toggle
            size="sm"
            checked={options.includeSubpages}
            onChange={(includeSubpages) => patch({ includeSubpages })}
            label="Include subpages"
          />
        </Row>
        <Row label="Create folders for subpages">
          <Toggle
            size="sm"
            checked={options.createFolders}
            onChange={(createFolders) => patch({ createFolders })}
            disabled={!options.includeSubpages}
            label="Create folders for subpages"
          />
        </Row>

        <div className="flex items-center justify-end gap-2 pt-4">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="export-confirm"
            disabled={busy}
            className="rounded-md bg-[var(--osio-accent)] px-3.5 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-60"
            onClick={() => void handleExport()}
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </Modal>
  );
};
