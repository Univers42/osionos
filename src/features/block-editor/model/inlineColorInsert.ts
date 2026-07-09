/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineColorInsert.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { applyInlineFormatting, parseInline } from "@/shared/lib/markengine";
import { getInlineNodesTextLength } from "@/shared/lib/markengine/inlineAst";
import { normalizeInlineColorToken } from "@/shared/lib/markengine/inlineColorTokens";

const PLACEHOLDER = "text";

export interface ColoredPlaceholder {
  content: string;
  start: number;
  end: number;
}

/**
 * Appends a colored placeholder run (`[color=…]text[/color]`) to `base` and
 * returns the source plus the placeholder's text offsets, so the caller can
 * select it — typing then overwrites the placeholder while staying inside the
 * color wrapper, so the *following* text is colored. Reuses the markengine
 * color machinery (no hand-rolled `[color]` syntax). Returns null for an
 * unrecognized color token.
 */
export function buildColoredPlaceholder(base: string, color: string): ColoredPlaceholder | null {
  if (!normalizeInlineColorToken(color)) return null;

  const separator = base.length > 0 && !/\s$/.test(base) ? " " : "";
  const baseTextLength = getInlineNodesTextLength(parseInline(base));
  const fragment = applyInlineFormatting(
    PLACEHOLDER,
    { start: 0, end: PLACEHOLDER.length },
    { type: "set_color", colorKind: "text", color },
  );

  const start = baseTextLength + separator.length;
  return {
    content: `${base}${separator}${fragment}`,
    start,
    end: start + PLACEHOLDER.length,
  };
}
