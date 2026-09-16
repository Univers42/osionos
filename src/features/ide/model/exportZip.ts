/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportZip.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { buildZip } from "@/features/page-export/model/zipWriter";
import type { ExportFile } from "@/features/page-export/model/exportTypes";
import { buildIdeFileTree } from "./ideFileTree";
import { collectTreeFiles, sanitizeSegment } from "./idePaths";

/** Encode the workspace's code files into a STORE zip (reuses the dependency-free
 *  page-export zip writer). Returns the archive + file count, or null when the
 *  project has no code files to export. */
export function buildIdeProjectZip(
  pages: PageEntry[],
): { bytes: Uint8Array; fileCount: number } | null {
  const files = collectTreeFiles(buildIdeFileTree(pages));
  if (files.length === 0) return null;
  const encoder = new TextEncoder();
  const exportFiles: ExportFile[] = files.map((file) => ({
    path: file.path,
    bytes: encoder.encode(file.content),
  }));
  return { bytes: buildZip(exportFiles), fileCount: exportFiles.length };
}

/** Trigger a browser download of `bytes` as `name` (a Blob + object URL). */
export function downloadBytes(name: string, bytes: Uint8Array): void {
  if (globalThis.document === undefined) return;
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Export the workspace's code project as a downloaded zip. Returns file count. */
export function exportIdeProjectZip(pages: PageEntry[], projectName: string): number {
  const built = buildIdeProjectZip(pages);
  if (!built) return 0;
  downloadBytes(`${sanitizeSegment(projectName) || "project"}.zip`, built.bytes);
  return built.fileCount;
}
