/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineTextEditing.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:25:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:25:38 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { parseInline } from "./markdown/index";
import type { InlineNode } from "./markdown/index";
import {
  cloneWrapperNode,
  getInlineNodesTextLength,
  hasInlineChildren,
  normalizeInlineNodes,
  serializeInlineNodes,
  splitNodesAtOffset,
  type WrapperNode,
} from "./inlineAst";
import type { InlineTextSelection } from "./inlineFormatting";

export type InlineTextEditCommand =
  | {
      type: "insert_text";
      text: string;
    }
  | {
      type: "delete_backward";
    }
  | {
      type: "delete_forward";
    };

export interface InlineTextEditResult {
  source: string;
  selection: InlineTextSelection;
}

export function applyInlineTextEdit(
  source: string,
  selection: InlineTextSelection,
  command: InlineTextEditCommand,
): InlineTextEditResult {
  const nodes = normalizeInlineNodes(parseInline(source));
  const normalizedSelection = normalizeSelection(
    selection,
    getInlineNodesTextLength(nodes),
  );

  if (command.type === "insert_text") {
    if (command.text.length === 0) {
      return {
        source,
        selection: normalizedSelection,
      };
    }

    return replaceInlineTextSelection(
      nodes,
      normalizedSelection,
      createInlineTextNodes(command.text),
    );
  }

  const deletionSelection = resolveDeletionSelection(
    normalizedSelection,
    command.type,
    getInlineNodesTextLength(nodes),
  );
  if (!deletionSelection) {
    return {
      source,
      selection: normalizedSelection,
    };
  }

  return replaceInlineTextSelection(nodes, deletionSelection, []);
}

function replaceInlineTextSelection(
  nodes: InlineNode[],
  selection: InlineTextSelection,
  replacementNodes: InlineNode[],
): InlineTextEditResult {
  const [before, afterStart] = splitNodesAtOffset(nodes, selection.start);
  const [, after] = splitNodesAtOffset(afterStart, selection.end - selection.start);
  const insertionContext = getInsertionContext(before, after);
  const wrappedReplacementNodes = wrapInlineNodesWithContext(
    replacementNodes,
    insertionContext,
  );
  const replacementTextLength = getInlineNodesTextLength(replacementNodes);
  const nextNodes = normalizeInlineNodes([
    ...before,
    ...wrappedReplacementNodes,
    ...after,
  ]);
  const nextSelectionOffset = selection.start + replacementTextLength;

  return {
    source: serializeInlineNodes(nextNodes),
    selection: {
      start: nextSelectionOffset,
      end: nextSelectionOffset,
    },
  };
}

function resolveDeletionSelection(
  selection: InlineTextSelection,
  commandType: Extract<InlineTextEditCommand, { type: "delete_backward" | "delete_forward" }>["type"],
  maxLength: number,
) {
  if (selection.start !== selection.end) {
    return selection;
  }

  if (commandType === "delete_backward") {
    if (selection.start === 0) {
      return null;
    }

    return {
      start: selection.start - 1,
      end: selection.start,
    };
  }

  if (selection.end >= maxLength) {
    return null;
  }

  return {
    start: selection.start,
    end: selection.start + 1,
  };
}

function normalizeSelection(
  selection: InlineTextSelection,
  maxLength: number,
): InlineTextSelection {
  const start = Math.max(0, Math.min(selection.start, maxLength));
  const end = Math.max(0, Math.min(selection.end, maxLength));
  return start <= end ? { start, end } : { start: end, end: start };
}

function createInlineTextNodes(text: string): InlineNode[] {
  if (text.length === 0) {
    return [];
  }

  const segments = text.split("\n");
  const nodes: InlineNode[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.length > 0) {
      nodes.push({ type: "text", value: segment });
    }
    if (index < segments.length - 1) {
      nodes.push({ type: "line_break" });
    }
  }

  return nodes;
}

function getInsertionContext(
  before: InlineNode[],
  after: InlineNode[],
): WrapperNode[] {
  const trailingPath = getTrailingWrapperPath(before);
  if (trailingPath && trailingPath.length > 0) {
    return trailingPath;
  }

  const leadingPath = getLeadingWrapperPath(after);
  if (leadingPath && leadingPath.length > 0) {
    return leadingPath;
  }

  return trailingPath ?? leadingPath ?? [];
}

function getTrailingWrapperPath(nodes: InlineNode[]): WrapperNode[] | null {
  const lastNode = nodes.at(-1);
  if (!lastNode) {
    return null;
  }

  if (!hasInlineChildren(lastNode)) {
    return [];
  }

  const childPath = getTrailingWrapperPath(lastNode.children);
  return childPath ? [lastNode, ...childPath] : [lastNode];
}

function getLeadingWrapperPath(nodes: InlineNode[]): WrapperNode[] | null {
  const [firstNode] = nodes;
  if (!firstNode) {
    return null;
  }

  if (!hasInlineChildren(firstNode)) {
    return [];
  }

  const childPath = getLeadingWrapperPath(firstNode.children);
  return childPath ? [firstNode, ...childPath] : [firstNode];
}

function wrapInlineNodesWithContext(
  nodes: InlineNode[],
  context: WrapperNode[],
): InlineNode[] {
  if (nodes.length === 0 || context.length === 0) {
    return nodes;
  }

  return context.reduceRight<InlineNode[]>(
    (children, wrapper) => [cloneWrapperNode(wrapper, children)],
    nodes,
  );
}
