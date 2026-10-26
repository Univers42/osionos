/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockOverlay.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { parseEmbedSnapshot } from "@/shared/lib/embed/embedInfo";

import type { BlockOverlay, BlockOverlayEntry } from "./types";

/** Gate an extra key's value before it is collected or applied. */
export type ExtraKeyCheck = (value: unknown) => boolean;

const isBoolean: ExtraKeyCheck = (value) => typeof value === "boolean";

// Ponytail: a valid color or mount id longer than 512 chars is dropped (false
// negative); the cap bounds what one front-matter entry may carry.
const isBoundedText: ExtraKeyCheck = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 512;

const isDueAt: ExtraKeyCheck = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const isIntegerAtLeast = (min: number): ExtraKeyCheck => (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= min;

// Ponytail: a legitimate width above 100% is dropped (false negative); the
// range keeps a persisted percentage sane.
const isMediaWidth: ExtraKeyCheck = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100;

const isHeadingLevel: ExtraKeyCheck = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;

const isOneOf = (...allowed: string[]): ExtraKeyCheck => (value) =>
  typeof value === "string" && allowed.includes(value);

// Arrays and null carry other prototypes, so this one check rejects them all.
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const isLayoutCells: ExtraKeyCheck = (value) =>
  Array.isArray(value) &&
  value.every((cell) => isPlainRecord(cell) && typeof cell.id === "string");

/** The provenance of an image the AI made: the model, the run and the date. */
const isAiGenerated: ExtraKeyCheck = (value) =>
  isPlainRecord(value) &&
  typeof value.model === "string" &&
  typeof value.runId === "string" &&
  typeof value.createdAt === "string";

/** Tags of an image (as "Describe with AI" writes them): ≤ 10 strings of ≤ 40 chars. */
const isMediaTags: ExtraKeyCheck = (value) =>
  Array.isArray(value) && value.length <= 10 && value.every((t) => typeof t === "string" && t.length > 0 && t.length <= 40);

const isMediaText: ExtraKeyCheck = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 300;

/** The allowlist of block attributes Markdown cannot carry; frozen, checks included. */
export const EXTRA_BLOCK_KEYS: Readonly<Record<string, ExtraKeyCheck>> = Object.freeze({
  collapsed: isBoolean,
  lineNumbers: isBoolean,
  deferMount: isBoolean,
  textColor: isBoundedText,
  backgroundColor: isBoundedText,
  color: isBoundedText,
  fileName: isBoundedText,
  sqlMountId: isBoundedText,
  fieldBind: isBoundedText,
  buttonProgram: isPlainRecord,
  mediaAspect: isBoundedText,
  viewId: isBoundedText,
  dueAt: isDueAt,
  heightLines: isIntegerAtLeast(1),
  recordLimit: isIntegerAtLeast(1),
  schemaVersion: isIntegerAtLeast(0),
  mediaWidth: isMediaWidth,
  codeView: isOneOf("preview", "source"),
  codeTheme: isOneOf("dark", "light"),
  mediaShape: isOneOf("rounded", "circle"),
  collectionRef: isOneOf("members", "marketplace"),
  recordRef: (value) =>
    typeof value === "string" &&
    (value === "$record" ||
      value === "$viewedUser" ||
      /^settings:[a-z][a-z0-9-]{0,63}$/.test(value)),
  layoutMode: isOneOf("inline", "full_page"),
  layoutRole: isOneOf("header"),
  layoutConfig: isPlainRecord,
  layoutCells: isLayoutCells,
  // Markdown carries a heading level only on a toggle ("##>"); a quote or a
  // callout heading would lose it, so it rides the overlay for every type.
  headingLevel: isHeadingLevel,
  // Ponytail: the fields inside are not validated (only "a plain object"), so a
  // hand-edited overlay can hand the renderer a nonsense width; it cannot reach
  // the prototype. Markdown carries only the column alignments of a table.
  tableConfig: isPlainRecord,
  // The merge's marker on a conflict copy: the id of the block it is a copy of.
  conflictOf: isBoundedText,
  // The provenance of an image the AI made (never the prompt): it rides the
  // overlay, so the "AI-generated" label survives a file round trip.
  aiGenerated: isAiGenerated,
  // A formula that shows or hides the block; rides the overlay so it survives
  // a markdown round trip.
  visibleWhen: isBoundedText,
  // What "Describe with AI" found in an image: tags and the text in it.
  mediaTags: isMediaTags,
  mediaText: isMediaText,
  // Typed style overrides (SB-1a): a plain record, validated by sanitize at use.
  style: isPlainRecord,
});

/**
 * Keys that ride the overlay only for some block types. `embed` is carried by the
 * fence of an embed/bookmark block, but a video/audio/file block is written as a bare
 * `<video src>` tag that has nowhere to put its snapshot, so it travels here. The check
 * is the snapshot decoder itself, which enforces the 64 KB cap, and what is kept is
 * its sanitised output (unsafe URLs blanked), on write and on read alike.
 */
const SCOPED_BLOCK_KEYS: Readonly<
  Record<string, { types: ReadonlySet<string>; decode: (value: unknown) => unknown }>
> = Object.freeze({
  embed: { types: new Set(["video", "audio", "file"]), decode: parseEmbedSnapshot },
});

export const SCOPED_OVERLAY_KEYS: readonly string[] = Object.freeze(Object.keys(SCOPED_BLOCK_KEYS));

function isScopedKeyFor(key: string, type: string): boolean {
  return Object.hasOwn(SCOPED_BLOCK_KEYS, key) && SCOPED_BLOCK_KEYS[key].types.has(type);
}

/** The value to keep for `key`, or undefined when it fails its check. */
function acceptedValue(key: string, value: unknown): unknown {
  if (isExtraBlockKey(key)) return EXTRA_BLOCK_KEYS[key](value) ? value : undefined;
  return SCOPED_BLOCK_KEYS[key]?.decode(value) ?? undefined;
}

/** Is `key` one of the overlay's extra keys? Object.hasOwn: no inherited names. */
export function isExtraBlockKey(key: string): boolean {
  return Object.hasOwn(EXTRA_BLOCK_KEYS, key);
}

/**
 * Collect the overlay for a block tree: every block gets an entry at its
 * pre-order index path ("0", "1.0") carrying its id plus every extra whose
 * value passes its key's check, so the id survives even without extras.
 * A value failing its check is omitted — never written to disk.
 * O(B×K): B blocks, K keys; each block is visited once per key.
 */
export function collectOverlay(
  blocks: readonly Block[],
  keys?: readonly string[],
): BlockOverlay {
  const wanted = keys ?? [...Object.keys(EXTRA_BLOCK_KEYS), ...SCOPED_OVERLAY_KEYS];
  const overlay: BlockOverlay = {};
  collectInto(blocks, wanted, "", overlay);
  return overlay;
}

function collectInto(
  blocks: readonly Block[],
  keys: readonly string[],
  prefix: string,
  out: BlockOverlay,
): void {
  for (let index = 0; index < blocks.length; index++) {
    const path = `${prefix}${index}`;
    const block = blocks[index];
    const entry: BlockOverlayEntry = { t: block.type, id: block.id };
    for (const key of keys) {
      if (!isExtraBlockKey(key) && !isScopedKeyFor(key, block.type)) continue;
      const value = block[key] === undefined ? undefined : acceptedValue(key, block[key]);
      if (value !== undefined) entry[key] = value;
    }
    out[path] = entry;
    if (block.children !== undefined) collectInto(block.children, keys, `${path}.`, out);
  }
}

/**
 * Re-apply a collected overlay onto freshly parsed blocks. At each path the
 * entry's id and extras are copied only when the entry's `t` still matches the
 * block's type, so a hand edit that inserted or removed blocks is not
 * mis-decorated. Returns a new tree; the input is never mutated.
 * O(B+E): B blocks, E overlay entries — one lookup per block, one pass over
 * each entry's own keys.
 */
export function applyOverlay(
  blocks: readonly Block[],
  overlay: BlockOverlay,
): Block[] {
  return applyToBlocks(blocks, overlay, "", new Set<string>());
}

function applyToBlocks(
  blocks: readonly Block[],
  overlay: BlockOverlay,
  prefix: string,
  usedIds: Set<string>,
): Block[] {
  const result: Block[] = [];
  for (let index = 0; index < blocks.length; index++) {
    result.push(applyToBlock(blocks[index], overlay, `${prefix}${index}`, usedIds));
  }
  return result;
}

function applyToBlock(
  block: Block,
  overlay: BlockOverlay,
  path: string,
  usedIds: Set<string>,
): Block {
  const copy: Block = { ...block };
  const entry = Object.hasOwn(overlay, path) ? overlay[path] : undefined;
  if (isPlainRecord(entry) && entry.t === block.type) {
    if (isFreshId(entry.id, usedIds)) copy.id = entry.id;
    for (const key of Object.keys(entry)) {
      if (key === "t" || key === "id") continue;
      if (!isExtraBlockKey(key) && !isScopedKeyFor(key, block.type)) continue;
      const value = entry[key] === undefined ? undefined : acceptedValue(key, entry[key]);
      if (value !== undefined) copy[key] = value;
    }
  }
  // Kept ids are tracked too, so two blocks can never share an id via the overlay.
  usedIds.add(copy.id);
  if (block.children !== undefined) {
    copy.children = applyToBlocks(block.children, overlay, `${path}.`, usedIds);
  }
  return copy;
}

// Ponytail: an overlay id longer than 128 chars is rejected (false negative);
// the cap keeps one entry a bounded, diffable front-matter line.
function isFreshId(id: unknown, usedIds: Set<string>): id is string {
  return (
    typeof id === "string" && id.length > 0 && id.length <= 128 && !usedIds.has(id)
  );
}
