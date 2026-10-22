/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramExport.ts                                    +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The export of a diagram: the compiled text, and the picture the locked
 * renderer already drew.
 *
 * NOTHING is rendered again here. The SVG the browser downloads is the very
 * element the ONE locked renderer produced — serialised, never re-rendered —
 * so the export cannot carry anything the page did not already draw
 * (devil C108, C109).
 *
 * A published page never exports: the page is a snapshot of somebody else's
 * view, and a diagram is a picture of the READER's own data.
 */

/** What an export did. */
export type ExportOutcome =
  /** The text is on the clipboard. */
  | "copied"
  /** The file is on its way to the disk. */
  | "downloaded"
  /** A published page: no export, no request. */
  | "refused"
  /** There was nothing to export. */
  | "empty"
  /** There is no clipboard to write to. */
  | "unavailable";

/**
 * May this document export a diagram?
 *
 * A published page may NOT: it is a snapshot of what the author saw, and the
 * diagram of a reader is a picture of the reader's own graph.
 */
export function canExportDiagram({ isPublic }: { isPublic: boolean }): boolean {
  return !isPublic;
}

/** The name of the exported file: the title of the diagram, as a file name. */
export function diagramFileName(title: string | undefined): string {
  const name = (title ?? "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${name || "diagram"}.svg`;
}

/**
 * The SVG of a drawn diagram, as text.
 *
 * The element is the one the locked renderer produced; the serialiser is the
 * browser's. Nothing is drawn again, and nothing is rewritten: a title that
 * carries a `<script>` is TEXT in the SVG, because the renderer put it there
 * as text.
 */
export function svgFileText(svg: SVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

/** The SVG of a drawn diagram, as the file the browser downloads. */
export function svgFileBlob(svg: SVGElement): Blob {
  return new Blob([svgFileText(svg)], { type: "image/svg+xml" });
}

/** The clipboard the browser gives, when it gives one. */
function browserClipboard(): Pick<Clipboard, "writeText"> | null {
  return globalThis.navigator?.clipboard ?? null;
}

/**
 * Copies the compiled text of a diagram to the clipboard.
 *
 * The text is the compiled mermaid — the very text the locked renderer drew —
 * so the copy carries the diagram, not a picture of it.
 */
export async function copyMermaidText(options: {
  /** True when this document is a published page. */
  isPublic: boolean;
  /** The compiled text of the diagram; null when there is none. */
  source: string | null;
  /** The clipboard, for a test; the browser's by default. */
  clipboard?: Pick<Clipboard, "writeText"> | null;
}): Promise<ExportOutcome> {
  if (!canExportDiagram({ isPublic: options.isPublic })) return "refused";
  if (!options.source) return "empty";
  const clipboard = options.clipboard ?? browserClipboard();
  if (!clipboard) return "unavailable";
  await clipboard.writeText(options.source);
  return "copied";
}

/** The anchor the browser downloads through. */
function defaultOpen(url: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
}

/**
 * Downloads the SVG of a drawn diagram.
 *
 * The object URL is revoked a TICK after the click, never synchronously: a
 * revoke that lands before the browser has read the Blob cancels the download
 * (Firefox). The URL does not outlive the download either way.
 */
export function downloadDiagramSvg(options: {
  /** True when this document is a published page. */
  isPublic: boolean;
  /** The element the locked renderer drew; null when there is none. */
  svg: SVGElement | null;
  /** The name of the file. */
  fileName: string;
  /** The object-URL factory, for a test; the browser's by default. */
  createUrl?: (blob: Blob) => string;
  /** The object-URL revoker, for a test; the browser's by default. */
  revokeUrl?: (url: string) => void;
  /** The download itself, for a test; the browser's by default. */
  open?: (url: string, fileName: string) => void;
  /** When the revoke happens; a tick later by default. */
  schedule?: (task: () => void) => void;
}): ExportOutcome {
  if (!canExportDiagram({ isPublic: options.isPublic })) return "refused";
  const svg = options.svg;
  if (!svg) return "empty";
  const createUrl = options.createUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl = options.revokeUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const open = options.open ?? defaultOpen;
  const schedule = options.schedule ?? ((task: () => void) => setTimeout(task, 0));
  const url = createUrl(svgFileBlob(svg));
  try {
    open(url, options.fileName);
  } finally {
    schedule(() => revokeUrl(url));
  }
  return "downloaded";
}
