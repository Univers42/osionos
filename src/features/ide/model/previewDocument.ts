/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   previewDocument.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { parse, type BlockNode } from "@osionos/markdown-engine";
import { parseMarkdownToBlocks } from "@osionos/markdown-engine/markdown/shortcuts";

/**
 * "alt": every image becomes its alt text (the editor page: its CSP refuses remote
 * images and a relative one would hit the node). "remote": https images stay (the app).
 */
export type ImagePolicy = "alt" | "remote";

/** "markdown": a plain .md, cleaned for the engine's renderer. "page": an .omd body as page blocks. */
export type PreviewParse = "markdown" | "page";

export type PageBlocks = ReturnType<typeof parseMarkdownToBlocks>;

export type PreviewDocument =
  | { ok: true; blocks: BlockNode[] }
  | { ok: true; pageBlocks: PageBlocks }
  | { ok: false; reason: "tooLarge" | "tooDeep" };

/**
 * Measured 2026-11-07 (parse + clean + render, node SSR, i5-13600KF, 3 runs): 1 MiB of
 * the engine's testing_markdown.md 0.27–0.36 s, 8 MiB 2.1–2.4 s. The editor opens files up
 * to 8 MiB and re-renders the preview after every typing pause, so it stops at 1 MiB.
 * Caveat: counts UTF-16 units, not bytes, and a browser's DOM commit costs more than the
 * SSR string this was timed on; a 1 MiB file with dense tables can still take ~0.5 s.
 */
export const PREVIEW_MAX_CHARS = 1 << 20;

// Anything else (docs/a.md, /api/x, //host, page:id, javascript:) would navigate the
// frame the preview sits in, and with it the unsaved text: it renders as plain text.
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|#fn-)/i;
const REMOTE_IMAGE = /^https:\/\//i;

type AstRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AstRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function cleanValue(value: unknown, images: ImagePolicy): unknown {
  if (Array.isArray(value)) return cleanArray(value, images);
  return isRecord(value) ? cleanFields(value, images) : value;
}

function cleanFields(record: AstRecord, images: ImagePolicy): AstRecord {
  const out: AstRecord = {};
  for (const [key, value] of Object.entries(record)) out[key] = cleanValue(value, images);
  return out;
}

// The title is dropped on purpose: the engine turns the "osio:mention" title into a
// chip with a favicon <img> fetched from the link's host.
function cleanLink(link: AstRecord, images: ImagePolicy): unknown[] {
  const children = Array.isArray(link.children) ? cleanArray(link.children, images) : [];
  const href = typeof link.href === "string" ? link.href : "";
  return SAFE_HREF.test(href) ? [{ type: "link", href, children }] : children;
}

function cleanImage(image: AstRecord, images: ImagePolicy): unknown[] {
  const src = typeof image.src === "string" ? image.src : "";
  if (images === "remote" && REMOTE_IMAGE.test(src)) return [image];
  const alt = typeof image.alt === "string" ? image.alt : "";
  return alt === "" ? [] : [{ type: "text", value: alt }];
}

function cleanItem(item: unknown, images: ImagePolicy): unknown[] {
  if (!isRecord(item)) return [cleanValue(item, images)];
  if (item.type === "link") return cleanLink(item, images);
  if (item.type === "image") return cleanImage(item, images);
  return [cleanFields(item, images)];
}

// Structural on purpose: every array of every node is walked, so a node type the
// engine adds later cannot carry a link or an image past this.
function cleanArray(items: readonly unknown[], images: ImagePolicy): unknown[] {
  return items.flatMap((item) => cleanItem(item, images));
}

/**
 * Caveat: the engine caps nesting at 32 levels and keeps deeper source as text (groot ADR
 * 0062), so depth no longer throws: a 1 MiB list nested 524287 deep parses in ~0.3 s (node
 * 22.23.5, engine 08301d0). tooDeep now means an unexpected engine throw; this catch is the
 * only guard, and the cap lives in another repo behind a gitlink. Unclosed openers (100k `[`,
 * "*a " or "_a " x10000) parse in under 20 ms there. In the worker a slow input costs the
 * parse budget (PREVIEW_PARSE_BUDGET_MS), never the editor.
 */
export function parsePreviewDocument(text: string, images: ImagePolicy): PreviewDocument {
  if (text.length > PREVIEW_MAX_CHARS) return { ok: false, reason: "tooLarge" };
  try {
    // The walk keeps every node's shape and swaps link/image nodes for valid inline nodes.
    return { ok: true, blocks: cleanArray(parse(text), images) as BlockNode[] };
  } catch {
    return { ok: false, reason: "tooDeep" };
  }
}

/**
 * The pure half of fileToPage: an .omd body to engine blocks. The codec and the worker both
 * call it, so the preview shows what the page would. It may throw; callers decide the fallback.
 */
export function parsePageBody(body: string): PageBlocks {
  return parseMarkdownToBlocks(body, { keepEmptyParagraphs: true, containerAttributes: true });
}

/**
 * Caveat: the engine throwing here ends as tooDeep, where fileToPage on the main thread
 * would have shown the body as one paragraph; the engine is not known to throw.
 */
export function parsePagePreview(body: string): PreviewDocument {
  if (body.length > PREVIEW_MAX_CHARS) return { ok: false, reason: "tooLarge" };
  try {
    return { ok: true, pageBlocks: parsePageBody(body) };
  } catch {
    return { ok: false, reason: "tooDeep" };
  }
}

export type PreviewRequest = { id: number; source: string; images: ImagePolicy; parse?: PreviewParse };
export type PreviewResponse = { id: number; document: PreviewDocument };

/**
 * The worker's whole job, outside the worker file so node:test can run it.
 * Caveat: the structured clone behind postMessage recurses and throws RangeError on a tree
 * deep enough for its stack (a list from ~350 levels on node 22.23.4 before the engine's
 * cap; a browser's limit is its own stack). Under the 32-level cap no source is known to
 * reach it, but nothing bounds the tree for every node type, so a clone failure still
 * reports tooDeep.
 */
export function answerPreviewRequest(request: PreviewRequest, post: (response: PreviewResponse) => void): void {
  const result = request.parse === "page" ? parsePagePreview(request.source) : parsePreviewDocument(request.source, request.images);
  try {
    post({ id: request.id, document: result });
  } catch {
    post({ id: request.id, document: { ok: false, reason: "tooDeep" } });
  }
}
