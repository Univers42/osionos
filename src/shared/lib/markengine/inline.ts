/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inline.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Inline editing surface — selection-based formatting, text edits, autoformat
 * and the inline document model. Operates on the inline AST, NOT on the DOM,
 * so everything here runs under a plain node test runner.
 *
 * DOM-bound helpers live in `./dom`.
 */

export {
  applyInlineFormatting,
  applyInlineFormattingToNodes,
  type InlineColorKind,
  type InlineFormatKind,
  type InlineFormattingCommand,
  type InlineTextSelection,
} from "./inlineFormatting";

export {
  applyInlineTextEdit,
  applyInlineTextEditToNodes,
  type InlineNodeTextEditResult,
  type InlineTextEditCommand,
  type InlineTextEditResult,
} from "./inlineTextEditing";

export {
  autoformatInlineMarkdown,
  isMidDelimiterRun,
  INLINE_CLOSING_DELIMITERS,
  type InlineAutoformatResult,
} from "./inlineAutoformat";

export {
  InlineDocument,
  type InlineDocumentEditResult,
} from "./inlineDocument";

export { normalizeHexColor, normalizeInlineColorToken } from "./inlineColorTokens";

export { normalizeInlineLinkHref } from "./inlineLinks";
export { normalizeInlineSource } from "./inlineSource";
