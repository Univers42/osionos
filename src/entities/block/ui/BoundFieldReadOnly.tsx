/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BoundFieldReadOnly.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useContext } from "react";
import type { Block } from "@/entities/block";
import { getBlockSurfaceStyle } from "@/features/block-editor/model/blockColors";
import { useBoundRecord, boundFieldText, BoundFieldEmptyText } from "../model/binding";
import { useBoundField } from "../model/bindingSources";

/**
 * Renders one user-record field bound via `recordRef: "$viewedUser"` (or the
 * modern `"$record"` / `"settings:<name>"` forms). The text size/weight follows
 * the carrying block's heading level so the admin can make a bound name a
 * heading and a bound bio a paragraph. Outside a binding context (e.g. dragged
 * into an ordinary page) it renders a subtle placeholder — never crashes, never
 * fetches.
 */
export function BoundFieldReadOnly({ block }: { block: Block }): React.ReactElement | null {
  const recordRef = typeof block.recordRef === "string" ? block.recordRef : undefined;
  const fieldBind = typeof block.fieldBind === "string" ? block.fieldBind : undefined;
  const record = useBoundRecord();
  const emptyText = useContext(BoundFieldEmptyText);
  const surface = getBlockSurfaceStyle(block);
  const cls = headingClass(block.headingLevel);

  const isContextRecord = recordRef === "$record" || recordRef === "$viewedUser";
  // Settings (and any other) sources are read through the binding-sources context.
  const bound = useBoundField(recordRef, fieldBind);

  if (isContextRecord && record === null) {
    return <span className={`${cls} italic text-[var(--osio-fg-subtle)]`}>{fieldBind ?? "field"}</span>;
  }

  if (bound.status !== "ready") {
    return <span className={`${cls} italic text-[var(--osio-fg-subtle)]`}>{fieldBind ?? "field"}</span>;
  }

  let text: string | null;
  if (isContextRecord) {
    text = boundFieldText(record, fieldBind) ?? emptyText;
  } else {
    text = valueToText(bound.value) ?? emptyText;
  }
  if (text === null) return null;
  return <span className={`${cls} text-[var(--osio-fg-default)]`} style={surface}>{text}</span>;
}

function valueToText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(", ");
  return String(value);
}

function headingClass(level: Block["headingLevel"]): string {
  if (level === 1) return "block text-3xl font-bold leading-tight";
  if (level === 2) return "block text-2xl font-semibold leading-tight";
  if (level === 3) return "block text-lg font-semibold leading-snug";
  return "block text-sm leading-relaxed";
}
