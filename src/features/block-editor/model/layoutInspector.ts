/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutInspector.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Layout inspector's model: the controls a block gets and the tree a choice
// writes. Every option is a STYLE_SCALES entry and every write goes through
// a scale check, so a written value is only ever a scale enum (ADR 0064 PS2).
// An absent key is today's look, so "Default" and Row remove the key.

import type { Block } from "@/entities/block";
import { PROP_SCALE, STYLE_SCALES, sanitizeBlockStyle, type BlockStyle } from "@/entities/block/model/blockStyle";
import { updateBlockInTree } from "@/entities/block/model/blockTreeUtils";

export type LayoutKey = "layout" | "gap" | "align" | "justify" | "wrap" | "cols" | "minCol" | "stackAt" | "padding" | "span";
export type LayoutValue = string | number;

export interface LayoutControl {
  key: LayoutKey;
  level: "basic" | "more";
  /** The block the choice writes to: the list itself, or one of its columns for span. */
  targetId: string;
  options: readonly LayoutValue[];
  value: LayoutValue | undefined;
}

const CONTAINER_KEYS: readonly LayoutKey[] = ["layout", "cols", "gap", "align", "justify", "wrap", "minCol", "stackAt", "span"];
/** The keys Reset clears; tone, surface and the rest belong to other menus. */
const RESET_KEYS: ReadonlySet<string> = new Set<string>([...CONTAINER_KEYS, "padding"]);
const MORE_KEYS = new Set<LayoutKey>(["align", "justify", "wrap", "minCol", "stackAt", "span"]);
/** The value an absent key already renders as. */
const IMPLIED: Partial<Record<LayoutKey, LayoutValue>> = { layout: "row", wrap: "nowrap" };

export function layoutOptions(key: LayoutKey): readonly LayoutValue[] {
  return STYLE_SCALES[PROP_SCALE[key]];
}

function control(block: Block, key: LayoutKey): LayoutControl {
  const value = sanitizeBlockStyle(block.style)[key];
  return { key, level: MORE_KEYS.has(key) ? "more" : "basic", targetId: block.id, options: layoutOptions(key), value };
}

/** Container keys that mean something in the list's current mode. */
function containerKeyApplies(key: LayoutKey, style: BlockStyle): boolean {
  const isGrid = style.layout === "grid";
  if (key === "cols") return isGrid;
  if (key === "wrap") return !isGrid && style.layout !== "stack";
  if (key === "minCol") return isGrid || style.wrap === "wrap";
  return key !== "span";
}

function containerControls(list: Block): LayoutControl[] {
  const style = sanitizeBlockStyle(list.style);
  const own = CONTAINER_KEYS.filter((key) => containerKeyApplies(key, style)).map((key) => control(list, key));
  const columns = style.layout === "grid" ? (list.children ?? []).filter((child) => child.type === "column") : [];
  const ordered = [...own.filter((item) => item.level === "basic"), ...own.filter((item) => item.level === "more")];
  return [...ordered, ...columns.map((column) => control(column, "span"))];
}

/** The controls the inspector shows for a block, basic ones first. */
export function layoutControlsFor(block: Block): LayoutControl[] {
  if (block.type === "column") return [];
  if (block.type === "column_list") return containerControls(block);
  return [control(block, "padding")];
}

/** A select's string back to its scale entry: undefined for Default, null when it is no entry. */
export function parseLayoutChoice(key: LayoutKey, raw: string): LayoutValue | undefined | null {
  if (raw === "") return undefined;
  return layoutOptions(key).find((option) => String(option) === raw) ?? null;
}

/** The stored style as a fresh record. Keys this build does not know are kept: a
 *  newer client's key must survive an older client's layout edit. */
function rawStyle(block: Block): Record<string, unknown> {
  const style: unknown = block.style;
  return style && typeof style === "object" && !Array.isArray(style) ? { ...(style as Record<string, unknown>) } : {};
}

function withStyle(block: Block, style: Record<string, unknown>): Block {
  if (Object.keys(style).length > 0) return { ...block, style: style as BlockStyle };
  const bare = { ...block };
  delete bare.style;
  return bare;
}

function setKey(block: Block, key: LayoutKey, value: LayoutValue | undefined): Block {
  const style = rawStyle(block);
  if (value === undefined || IMPLIED[key] === value) delete style[key];
  else style[key] = value;
  return withStyle(block, style);
}

/** The tree with one choice written: one call is one undo step for the caller. */
export function applyLayoutChoice(blocks: Block[], targetId: string, key: LayoutKey, value: LayoutValue | undefined): Block[] {
  if (value !== undefined && !layoutOptions(key).includes(value)) return blocks;
  return updateBlockInTree(blocks, targetId, (block) => setKey(block, key, value));
}

function clearLayoutKeys(block: Block): Block {
  const style = rawStyle(block);
  const kept = Object.entries(style).filter(([key]) => !RESET_KEYS.has(key));
  if (kept.length === Object.keys(style).length) return block;
  return withStyle(block, Object.fromEntries(kept));
}

/** The tree with the block's layout keys, and its columns' spans, removed. */
export function resetLayout(blocks: Block[], blockId: string): Block[] {
  return updateBlockInTree(blocks, blockId, (block) => {
    const cleared = clearLayoutKeys(block);
    if (block.type !== "column_list" || !block.children) return cleared;
    const children = block.children.map((child) => (child.type === "column" ? clearLayoutKeys(child) : child));
    const changed = children.some((child, index) => child !== block.children?.[index]);
    return changed ? { ...cleared, children } : cleared;
  });
}
