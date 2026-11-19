/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   containerStyle.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The engine's `containerAttributes` (parsed with `{ containerAttributes: true }`) become
// style here, after the overlay is applied (ADR 0064 PS14). A block whose opener carried
// attributes or a sugar kind takes every layout key from the markdown, so a hand edit
// that removes `cols=3` removes it; its other style keys keep the overlay's values. A
// block with none keeps the overlay's style untouched: a file live wrote loses nothing.
// The engine field never survives this pass.
import type { Block } from "@/entities/block";
import { LAYOUT_STYLE_KEYS, styleFromAttributes, type StyleAttributeDrop } from "@/entities/block/model/blockStyleAttributes";
import type { BlockStyle } from "@/entities/block/model/blockStyle";

/** An attribute the reader dropped, on the block that carried it. */
export interface ContainerAttributeDrop extends StyleAttributeDrop {
  blockId: string;
}

interface EngineAttributes {
  kind: string;
  values: Readonly<Record<string, string>>;
  dropped: readonly string[];
}

const LAYOUT_KEYS: ReadonlySet<string> = new Set(LAYOUT_STYLE_KEYS);

function isEngineAttributes(value: unknown): value is EngineAttributes {
  if (value === null || typeof value !== "object") return false;
  const { kind, values, dropped } = value as Record<string, unknown>;
  return typeof kind === "string" && typeof values === "object" && values !== null && Array.isArray(dropped);
}

function sameRecord(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
}

/** The overlay's non-layout keys, then the markdown's style. The overlay object itself
 *  when nothing changed, so the next write keeps its bytes; undefined when empty. */
function mergedStyle(overlay: unknown, fromMarkdown: BlockStyle): BlockStyle | undefined {
  const previous = overlay !== null && typeof overlay === "object" ? (overlay as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(previous)) {
    if (!LAYOUT_KEYS.has(key)) merged[key] = previous[key];
  }
  Object.assign(merged, fromMarkdown);
  if (sameRecord(merged, previous)) return overlay as BlockStyle | undefined;
  return Object.keys(merged).length > 0 ? (merged as BlockStyle) : undefined;
}

// A block with nothing to resolve is returned as is, so the reference identity
// reconcileBlocks kept for unchanged blocks survives this pass.
function resolveBlock(block: Block, dropped: ContainerAttributeDrop[]): Block {
  const children = block.children === undefined ? undefined : resolveBlocks(block.children, dropped);
  if (!Object.hasOwn(block, "containerAttributes") && children === block.children) return block;
  const { containerAttributes, ...rest } = block;
  const out = rest as Block;
  if (children !== undefined) out.children = children;
  if (!isEngineAttributes(containerAttributes)) return out;
  const read = styleFromAttributes(containerAttributes.kind, containerAttributes.values);
  for (const reason of containerAttributes.dropped) dropped.push({ blockId: out.id, reason });
  for (const drop of read.dropped) dropped.push({ blockId: out.id, ...drop });
  const style = mergedStyle(block.style, read.style);
  if (style === undefined) delete out.style;
  else out.style = style;
  return out;
}

function resolveBlocks(blocks: Block[], dropped: ContainerAttributeDrop[]): Block[] {
  let changed = false;
  const next = blocks.map((block) => {
    const resolved = resolveBlock(block, dropped);
    if (resolved !== block) changed = true;
    return resolved;
  });
  return changed ? next : blocks;
}

/** Blocks with container attributes turned into style, plus what was dropped. O(B).
 *  Unchanged blocks and arrays come back by reference. */
export function resolveContainerAttributes(blocks: Block[]): { blocks: Block[]; dropped: ContainerAttributeDrop[] } {
  const dropped: ContainerAttributeDrop[] = [];
  return { blocks: resolveBlocks(blocks, dropped), dropped };
}
