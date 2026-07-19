/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportTypes.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

export type ExportFormat = "markdown" | "html" | "pdf" | "json";
export type ExportDbViews = "current" | "default";
export type ExportContent = "everything" | "no_files";
/**
 * The style axis of an export. "styled" corrects output for the outside world
 * (standard markdown syntax, themed HTML, typographic PDF, clean JSON);
 * "raw" is the fastest, lossless form (editor inline dialect kept, bare
 * semantic HTML, plain-text PDF, the stored block tree verbatim).
 */
export type ExportStyling = "styled" | "raw";

export interface ExportOptions {
  format: ExportFormat;
  styling: ExportStyling;
  dbViews: ExportDbViews;
  content: ExportContent;
  includeSubpages: boolean;
  /** Only meaningful when includeSubpages is on (Notion greys it otherwise). */
  createFolders: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "markdown",
  styling: "styled",
  dbViews: "current",
  content: "everything",
  includeSubpages: false,
  createFolders: true,
};

/**
 * Snapshot of the live editor theme (resolved --osio-* tokens), captured in
 * the UI layer so the pure serializers stay DOM-free and node-testable.
 */
export interface ExportTheme {
  bg: string;
  fg: string;
  fgMuted: string;
  accent: string;
  border: string;
  codeBg: string;
  codeFg: string;
  fontSans: string;
  fontMono: string;
}

/** One page flattened for export: title + loaded block tree + tree position. */
export interface ExportPageNode {
  id: string;
  title: string;
  blocks: Block[];
  /** Ancestor titles from the exported root down to the parent (for folders). */
  chain: string[];
}

/** A database referenced by an exported page, resolved to tabular data. */
export interface ExportDatabase {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
}

/** One produced artifact: a path inside the archive + raw bytes. */
export interface ExportFile {
  path: string;
  bytes: Uint8Array;
}
