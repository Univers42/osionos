/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportPdf.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// pdf-lib renderer: A4 pages, word-wrapped styled lines, embedded images
// (fetched at export time; a failed fetch degrades to a text line). pdf-lib is
// already a dependency (database blocks) and loads as its own lazy chunk here.

import type { Block } from "@/entities/block";
import type { ExportDatabase, ExportOptions } from "./exportTypes";
import { flattenBlocksToPdfLines, pdfText, type PdfLine } from "./exportPdfLines";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

async function fetchImageBytes(src: string): Promise<{ bytes: Uint8Array; png: boolean } | null> {
  try {
    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    const png = type.includes("png") || src.toLowerCase().includes(".png") || bytes[0] === 0x89;
    return { bytes, png };
  } catch {
    return null;
  }
}

export async function renderPagePdf(
  title: string,
  blocks: Block[],
  options: Pick<ExportOptions, "content">,
  resolveDatabase: (block: Block) => ExportDatabase | null,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const ensureRoom = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawWrapped = (line: PdfLine) => {
    const font = line.mono ? mono : line.bold ? bold : regular;
    const width = CONTENT_W - line.indent;
    const words = line.text.split(/\s+/).filter(Boolean);
    let current = "";
    const rows: string[] = [];
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, line.size) > width && current) {
        rows.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) rows.push(current);
    if (rows.length === 0) rows.push(" ");
    y -= line.gapBefore;
    for (const row of rows) {
      const rowHeight = line.size * 1.35;
      ensureRoom(rowHeight);
      y -= rowHeight;
      page.drawText(row, { x: MARGIN + line.indent, y, size: line.size, font });
    }
  };

  const drawImage = async (line: PdfLine) => {
    const fetched = line.imageSrc ? await fetchImageBytes(line.imageSrc) : null;
    if (!fetched) {
      drawWrapped({ ...line, text: `[image] ${pdfText(line.imageSrc ?? "")}`, size: 9.5, imageSrc: undefined });
      return;
    }
    try {
      const image = fetched.png ? await doc.embedPng(fetched.bytes) : await doc.embedJpg(fetched.bytes);
      const maxWidth = CONTENT_W - line.indent;
      const scale = Math.min(1, maxWidth / image.width, 420 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      y -= line.gapBefore;
      ensureRoom(height);
      y -= height;
      page.drawImage(image, { x: MARGIN + line.indent, y, width, height });
    } catch {
      drawWrapped({ ...line, text: `[image] ${pdfText(line.imageSrc ?? "")}`, size: 9.5, imageSrc: undefined });
    }
  };

  drawWrapped({ text: pdfText(title || "Untitled"), size: 26, bold: true, indent: 0, gapBefore: 0 });
  for (const line of flattenBlocksToPdfLines(blocks, options, resolveDatabase)) {
    if (line.imageSrc) await drawImage(line);
    else drawWrapped(line);
  }
  return doc.save();
}
