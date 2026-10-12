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
  recordRef: isOneOf("$record", "$viewedUser"),
  layoutMode: isOneOf("inline", "full_page"),
  layoutRole: isOneOf("header"),
  layoutConfig: isPlainRecord,
  layoutCells: isLayoutCells,
});

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
  const wanted = keys ?? Object.keys(EXTRA_BLOCK_KEYS);
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
      if (!isExtraBlockKey(key)) continue;
      const value = block[key];
      if (value !== undefined && EXTRA_BLOCK_KEYS[key](value)) entry[key] = value;
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
      if (key === "t" || key === "id" || !isExtraBlockKey(key)) continue;
      const value = entry[key];
      if (value !== undefined && EXTRA_BLOCK_KEYS[key](value)) copy[key] = value;
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
