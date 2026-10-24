/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BoundFieldReadOnly.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useContext } from "react";
import type { Block } from "@/entities/block";
import { getBlockSurfaceStyle } from "@/features/block-editor/model/blockColors";
import { useBoundRecord, boundFieldText, BoundFieldEmptyText } from "../model/binding";

/**
 * Renders one user-record field bound via `recordRef: "$viewedUser"`. The text
 * size/weight follows the carrying block's heading level so the admin can make a
 * bound name a heading and a bound bio a paragraph. Outside a binding context
 * (e.g. dragged into an ordinary page) it renders a subtle placeholder — never
 * crashes, never fetches.
 */
export function BoundFieldReadOnly({ block }: { block: Block }): React.ReactElement | null {
  const record = useBoundRecord();
  const emptyText = useContext(BoundFieldEmptyText);
  const surface = getBlockSurfaceStyle(block);
  const cls = headingClass(block.headingLevel);
  if (record === null) {
    return <span className={`${cls} italic text-[var(--osio-fg-subtle)]`}>{block.fieldBind ?? "field"}</span>;
  }
  const text = boundFieldText(record, block.fieldBind) ?? emptyText;
  if (text === null) return null;
  return <span className={`${cls} text-[var(--osio-fg-default)]`} style={surface}>{text}</span>;
}

function headingClass(level: Block["headingLevel"]): string {
  if (level === 1) return "block text-3xl font-bold leading-tight";
  if (level === 2) return "block text-2xl font-semibold leading-tight";
  if (level === 3) return "block text-lg font-semibold leading-snug";
  return "block text-sm leading-relaxed";
}
