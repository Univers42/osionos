/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bindingEdit.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { boundFieldText, isReadmeField, type BoundRecord } from "@/entities/block/model/binding";
import { PROFESSIONS } from "@/data/professions/professions";
import { bound } from "@/data/templates/templateBlocks";
import type { AccountProfile } from "@/shared/api/accountProfileApi";

export type ProfileFieldStyle = "text" | 1 | 2 | 3;

const PREVIEW_MAX = 120;

/** The style a block currently shows: its heading level, else plain text. */
export function styleOf(block: Pick<Block, "type" | "headingLevel">): ProfileFieldStyle {
  const level = block.type === "heading_1" ? 1 : block.type === "heading_2" ? 2 : block.type === "heading_3" ? 3 : null;
  return level ?? "text";
}

/**
 * The patch that binds `block` to `field` in `style`, or null when the field is outside
 * the README allowlist. `undefined` values delete a stale `headingLevel` on merge. The value
 * is never copied into `content`.
 */
export function bindBlock(block: Pick<Block, "id">, field: string, style: ProfileFieldStyle = "text"): Partial<Block> | null {
  if (!isReadmeField(field)) return null;
  const level = style === "text" ? undefined : style;
  const { type, recordRef, fieldBind } = bound(block.id, field, level);
  return { type, content: "", recordRef, fieldBind, headingLevel: level };
}

/** The type/level pair for a style alone, for a block whose stored field is not in the list. */
export function restyleBlock(style: ProfileFieldStyle): Partial<Block> {
  return style === "text" ? { type: "paragraph", headingLevel: undefined } : { type: `heading_${style}`, headingLevel: style };
}

/** The patch that turns a bound block back into an empty paragraph. */
export function unbindBlock(): Partial<Block> {
  return { type: "paragraph", content: "", recordRef: undefined, fieldBind: undefined, headingLevel: undefined };
}

/** True when the block can be bound or already is: a paragraph or a heading. */
export function isBindableType(block: Pick<Block, "type">): boolean {
  return block.type === "paragraph" || block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3";
}

/**
 * What a reader would see for `field` on the owner's own profile, or null when empty.
 * The profession id is shown as its label, like the README record does; no fetch.
 */
export function previewFor(profile: AccountProfile | null, field: string | undefined): string | null {
  if (!profile) return null;
  const record: BoundRecord = { ...profile, id: profile.userId };
  const text = boundFieldText(record, field);
  if (text !== null && field === "profession") return PROFESSIONS.find((item) => item.id === text)?.label ?? text;
  return text;
}

/** Truncate for display; the full text goes in a `title`. */
export function clipPreview(text: string): string {
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
}
