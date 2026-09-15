/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dom.ts                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * contentEditable surface — the only part of the engine that touches the DOM
 * (`getSelection`, `createRange`, `createTreeWalker`, text nodes).
 *
 * Kept off the root entry point so a node test runner, an SSR pass, or a worker
 * can import the engine without a DOM. Requires `lib.dom`.
 */

export {
  readInlineEditorDomState,
  inlineSourceCaretOffset,
  type InlineEditorDomState,
} from "./inlineEditorDom";

export {
  areInlineEditorSelectionSnapshotsEqual,
  getInlineEditorOffsetsForRange,
  getInlineEditorSelectionOffsets,
  getInlineEditorSelectionSnapshot,
  setInlineCaretAfterStyledBoundary,
  setInlineEditorSelectionOffsets,
  type InlineEditorSelectionOffsets,
  type InlineEditorSelectionSnapshot,
} from "./inlineEditorSelection";
