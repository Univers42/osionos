/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:21:47 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:21:48 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export {
  parseInlineMarkdown,
  renderInlineToReact,
} from './shortcuts';
export { detectBlockType, parseMarkdownToBlocks } from './shortcuts';
export {
  applyInlineFormatting,
  type InlineColorKind,
  type InlineFormatKind,
  type InlineFormattingCommand,
  type InlineTextSelection,
} from './inlineFormatting';
export {
  applyInlineTextEdit,
  type InlineTextEditCommand,
  type InlineTextEditResult,
} from './inlineTextEditing';
export {
  readInlineEditorDomState,
  type InlineEditorDomState,
} from './inlineEditorDom';
export {
  areInlineEditorSelectionSnapshotsEqual,
  getInlineEditorSelectionOffsets,
  getInlineEditorSelectionSnapshot,
  setInlineEditorSelectionOffsets,
  type InlineEditorSelectionOffsets,
  type InlineEditorSelectionSnapshot,
} from './inlineEditorSelection';
export { normalizeInlineLinkHref } from './inlineLinks';
export { normalizeInlineSource } from './inlineSource';
export { getCalloutIcon as getCalloutIconForKind } from './markdown/renderers/terminalHelpers';
