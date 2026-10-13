/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileCodec.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { codeBlockOf } from "@/features/ide/model/codeFile";
import { serializeBlocksToMarkdown } from "@/services/page-actions/pageMarkdownSerialize";
import { parseMarkdownToBlocks } from "@osionos/markdown-engine/markdown/shortcuts";
import { reconcileBlocks } from "@/features/raw-mode/model/reconcileBlocks";

import { EXTRA_BLOCK_KEYS, applyOverlay, collectOverlay } from "./blockOverlay";
import { joinFrontMatter, splitFrontMatter } from "./frontMatter";
import { metaFromPage, patchFromMeta } from "./pageFileMeta";
import { kindOfPage } from "./pagePaths";
import {
  FOLDER_META_NAME,
  PAGE_FILE_SUFFIX,
  type BlockOverlay,
  type BlockOverlayEntry,
  type PageFileMeta,
  type ParsedPageFile,
} from "./types";

/**
 * Which side of the file carries each Block field. Every row was decided by a
 * serialize → parse round trip on the block type that owns the key, never by
 * reading the serializer (tests/canvas/page-file-codec.test.ts, "markdown
 * carries every MARKDOWN key" and "... none of the OVERLAY keys", over the
 * probes in page-file-codec-fixtures.ts). Putting a key on the wrong side is
 * not harmless: a stale overlay value would override a hand edit of the
 * Markdown, and a missing one loses data.
 *
 *   MARKDOWN (parsed back from the body)     id/type/content/children structural
 *     checked  language  asset  mediaAlt  widthRatio  color (callout icon)
 *     drawHeight  buttonLabel/Href/Variant  tableData
 *     databaseId  viewId  recordLimit
 *     layoutMode  layoutRole  layoutConfig  layoutCells  schemaVersion
 *   OVERLAY (front-matter `blocks`)          everything else in EXTRA_BLOCK_KEYS
 *     dueAt  collapsed  codeView  codeTheme  lineNumbers  fileName  sqlMountId
 *     heightLines  textColor  backgroundColor  mediaWidth  mediaShape
 *     mediaAspect  deferMount  collectionRef  recordRef  fieldBind
 *     headingLevel (markdown keeps it on a toggle only; quote/callout lose it)
 *     tableConfig (markdown keeps only the column alignments)
 *
 * Ponytail: `fileName`, `headingLevel` and `tableConfig` are partly in Markdown
 * too (`<object title>`, `##>`, the table separator row), and the overlay wins,
 * so a hand edit of exactly those loses to the stored value until the next save.
 */
/** Carried by Markdown, or handled structurally: the overlay must not hold it. */
export const MARKDOWN_KEYS: readonly string[] = Object.freeze([
  "id", "type", "content", "children",
  "checked", "language", "asset", "mediaAlt", "widthRatio",
  "color", "drawHeight", "buttonLabel", "buttonHref", "buttonVariant",
  "tableData", "databaseId", "viewId", "recordLimit",
  "layoutMode", "layoutRole", "layoutConfig", "layoutCells", "schemaVersion",
]);

/**
 * Extra keys Markdown does NOT carry, so they ride the overlay. Derived, not
 * typed out: a key added to `EXTRA_BLOCK_KEYS` is picked up here at once and the
 * Block-field self-check then forces someone to classify it.
 */
export const OVERLAY_KEYS: readonly string[] = Object.freeze(
  Object.keys(EXTRA_BLOCK_KEYS).filter((key) => !MARKDOWN_KEYS.includes(key)),
);

/**
 * Persistent Block fields the file format does not carry at all. The Block-field
 * self-check fails on any field that is in none of the three lists, so a new
 * field cannot be added without being classified.
 */
export const KNOWN_LOSSY_KEYS: readonly string[] = Object.freeze([
  // Transient UI state: an empty transformed block re-derives it from its type.
  "placeholderText",
]);

/** Any `.omd` name, the folder meta file included. */
export function isPageFileName(name: string): boolean {
  return name.toLowerCase().endsWith(PAGE_FILE_SUFFIX);
}

export function isFolderMetaName(name: string): boolean {
  return name === FOLDER_META_NAME;
}

/** The exact bytes a page is stored as: `.omd` text for block pages and folder
 *  meta, the raw code text (no front-matter) for `surface:"code"`. Deterministic:
 *  the same page always yields the same string (sha16 of it is the sync hash). */
export function pageToFile(page: PageEntry): string {
  const kind = kindOfPage(page);
  if (kind === "code") return codeBlockOf(page)?.content ?? "";
  const meta = metaFromPage(page);
  if (kind === "dir") return joinFrontMatter({ ...meta }, "");
  const content = page.content ?? [];
  if (content.length === 0) return joinFrontMatter({ ...meta }, "");
  return joinFrontMatter(
    { ...meta, blocks: collectOverlay(content, OVERLAY_KEYS) },
    serializeBlocksToMarkdown(content),
  );
}

/**
 * Parse `.omd` text. `existing` (the page the file's id resolves to) lends
 * block ids by position when the overlay is missing. Never throws.
 *
 * A `surface:"code"` page never comes through here: its whole file IS the text
 * of its `code` block, so `pageToFile` writes it raw and the caller stores that
 * string as the content — parsing it into blocks would round-trip fence text.
 */
export function fileToPage(text: string, existing?: PageEntry): ParsedPageFile {
  const split = splitFrontMatter(text);
  const patch = patchFromMeta(split.meta);
  // Validated once: the guard walks every overlay entry, and both the meta and
  // the block restore need its verdict.
  const overlay = isBlockOverlay(split.meta.blocks) ? split.meta.blocks : undefined;
  return {
    meta: metaOf(split.meta, patch, overlay),
    patch,
    content: blocksOf(split.body, overlay, existing),
    frontMatterError: split.error,
  };
}

/** Blocks for a body: the overlay restores ids/extras, else `existing` by position. */
function blocksOf(body: string, overlay: BlockOverlay | undefined, existing?: PageEntry): Block[] {
  const blocks = parseBody(body);
  if (overlay !== undefined) return applyOverlay(blocks, overlay);
  if (existing?.content !== undefined) return reconcileBlocks(blocks, existing.content);
  return blocks;
}

/** A parser crash must not eat a hand-edited file: one paragraph holds the body. */
function parseBody(body: string): Block[] {
  try {
    return parseMarkdownToBlocks(body);
  } catch {
    return [{ id: crypto.randomUUID(), type: "paragraph", content: body }];
  }
}

/** The validated front-matter subset: the patch's inverse, plus id/updated. */
function metaOf(
  raw: Record<string, unknown>,
  patch: Partial<PageEntry>,
  overlay: BlockOverlay | undefined,
): PageFileMeta {
  const meta: PageFileMeta = {};
  if (patch.title !== undefined) meta.title = patch.title;
  if (patch.icon !== undefined) meta.icon = patch.icon;
  if (patch.cover !== undefined) meta.cover = patch.cover;
  if (patch.coverPosition !== undefined) meta.cover_position = patch.coverPosition;
  if (patch.surface !== undefined) meta.surface = patch.surface;
  if (patch.visibility !== undefined) meta.visibility = patch.visibility;
  if (typeof patch.databaseId === "string") meta.database_id = patch.databaseId;
  if (patch.isTemplate !== undefined) meta.template = patch.isTemplate;
  if (patch.isDefaultTemplate !== undefined) meta.template_default = patch.isDefaultTemplate;
  if (patch.templateSurface !== undefined) meta.template_surface = patch.templateSurface;
  if (patch.recurrence !== undefined) meta.recurrence = patch.recurrence;
  if (patch.properties !== undefined) meta.properties = patch.properties;
  if (isBoundedString(raw.id)) meta.id = raw.id;
  if (isBoundedString(raw.updated)) meta.updated = raw.updated;
  if (overlay !== undefined) meta.blocks = overlay;
  return meta;
}

// Ponytail: an id or timestamp longer than 4096 chars is dropped (false
// negative); the cap mirrors pageFileMeta's and keeps one line bounded.
function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 4096;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOverlayEntry(value: unknown): value is BlockOverlayEntry {
  return isRecord(value) && typeof value.t === "string" && typeof value.id === "string";
}

/**
 * O(E) over the entries, no allocation. Ponytail: one malformed entry rejects
 * the whole overlay (the caller then falls back to `existing` by position), so
 * a hand-corrupted line costs the other blocks their extras until the next save.
 */
function isBlockOverlay(value: unknown): value is BlockOverlay {
  if (!isRecord(value)) return false;
  for (const key in value) {
    if (!isOverlayEntry(value[key])) return false;
  }
  return true;
}
