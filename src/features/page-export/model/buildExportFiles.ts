/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buildExportFiles.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure(ish) serialization stage of an export run: collected pages + options +
// injected database state → the exact files of the archive. No store, no DOM —
// the whole format × option matrix is unit-tested in node on real bytes.

import type { Block } from "@/entities/block";
import type { NotionState } from "@notion-db/contract-types";
import { resolveDatabaseExport } from "./databaseExportSource";
import { toCsv } from "./exportCsv";
import { databaseTableHtml, exportPageHtml } from "./exportHtml";
import { exportPageMarkdown } from "./exportMarkdown";
import { createNameAllocator, pageDirectory, sanitizeFileName } from "./exportPaths";
import type { ExportFile, ExportOptions, ExportPageNode } from "./exportTypes";

const encoder = new TextEncoder();

export interface BuildInput {
  pages: ExportPageNode[];
  options: ExportOptions;
  /** Object-database state; null exports database blocks as plain titles. */
  dbState: NotionState | null;
}

export async function buildExportFiles({ pages, options, dbState }: BuildInput): Promise<ExportFile[]> {
  const files: ExportFile[] = [];
  const allocate = createNameAllocator();
  const useFolders = options.includeSubpages && options.createFolders;

  for (const page of pages) {
    const dir = pageDirectory(page.chain, useFolders);
    const base = sanitizeFileName(page.title);
    const resolveDb = (block: Block) =>
      dbState ? resolveDatabaseExport(dbState, block, options.dbViews) : null;

    if (options.format === "markdown") {
      const markdown = exportPageMarkdown(page.title, page.blocks, options, (block) => {
        const db = resolveDb(block);
        if (!db) return null;
        const csvPath = allocate(dir, `${base} - ${sanitizeFileName(db.title)}`, ".csv");
        files.push({ path: csvPath, bytes: encoder.encode(toCsv(db.columns, db.rows)) });
        const csvName = csvPath.slice(csvPath.lastIndexOf("/") + 1);
        return `[${db.title}](${encodeURI(csvName)})`;
      });
      files.push({ path: allocate(dir, base, ".md"), bytes: encoder.encode(markdown) });
    } else if (options.format === "html") {
      const html = exportPageHtml(page.title, page.blocks, options, (block) => {
        const db = resolveDb(block);
        return db ? databaseTableHtml(db.title, db.columns, db.rows) : null;
      });
      files.push({ path: allocate(dir, base, ".html"), bytes: encoder.encode(html) });
    } else {
      const { renderPagePdf } = await import("./exportPdf");
      const bytes = await renderPagePdf(page.title, page.blocks, options, resolveDb);
      files.push({ path: allocate(dir, base, ".pdf"), bytes });
    }
  }
  return files;
}
