/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runExport.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Orchestrates one export run: collect pages → serialize per format →
// one file downloads bare, several download as a zip. buildExportFiles is
// dependency-injected (database state, no DOM) so tests can drive the whole
// matrix in node and inspect the real bytes.

import type { NotionState } from "@notion-db/contract-types";
import { buildExportFiles } from "./buildExportFiles";
import { collectExportPages } from "./collectPages";
import { sanitizeFileName } from "./exportPaths";
import { captureExportTheme } from "./exportTheme";
import type { ExportOptions } from "./exportTypes";
import { buildZip } from "./zipWriter";

const MIME: Record<string, string> = {
  ".md": "text/markdown", ".csv": "text/csv", ".html": "text/html",
  ".pdf": "application/pdf", ".zip": "application/zip", ".json": "application/json",
};

function downloadBlob(name: string, bytes: Uint8Array) {
  const extension = name.slice(name.lastIndexOf("."));
  const blob = new Blob([bytes as BlobPart], { type: MIME[extension] ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface RunExportInput {
  pageId: string;
  workspaceId: string;
  jwt: string;
  options: ExportOptions;
}

/** Full user-facing export: returns the downloaded file name + file count. */
export async function runPageExport(input: RunExportInput): Promise<{ fileName: string; fileCount: number }> {
  const pages = await collectExportPages({
    pageId: input.pageId,
    workspaceId: input.workspaceId,
    jwt: input.jwt,
    includeSubpages: input.options.includeSubpages,
  });

  let dbState: NotionState | null = null;
  try {
    const { loadKnownDatabaseState } = await import("@/widgets/database-view/model/knownDatabaseState");
    dbState = loadKnownDatabaseState();
  } catch {
    // No database plane available (offline harness) — blocks degrade to text.
  }

  // Styled HTML mirrors the user's live theme; every other path skips the DOM.
  const theme = input.options.format === "html" && input.options.styling !== "raw"
    ? captureExportTheme()
    : null;
  const files = await buildExportFiles({ pages, options: input.options, dbState, theme });
  const rootName = sanitizeFileName(pages[0]?.title ?? "Export");
  if (files.length === 1) {
    const only = files[0]!;
    const name = only.path.slice(only.path.lastIndexOf("/") + 1);
    downloadBlob(name, only.bytes);
    return { fileName: name, fileCount: 1 };
  }
  const zipName = `${rootName}.zip`;
  downloadBlob(zipName, buildZip(files));
  return { fileName: zipName, fileCount: files.length };
}
