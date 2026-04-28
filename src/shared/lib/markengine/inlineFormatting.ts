/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineFormatting.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/16 21:45:31 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/16 21:45:32 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { parseInline } from "./markdown/index";
import type { InlineNode } from "./markdown/index";
import {
  areInlineNodeListsEqual,
  cloneWrapperNode,
  getInlineNodesTextLength,
  hasInlineChildren,
  normalizeInlineNodes,
  serializeInlineNodes,
  splitNodesAtOffset,
  type WrapperNode,
} from "./inlineAst";
import { normalizeInlineColorToken } from "./inlineTextStyles";

const NO_ACTIVE_VALUE = "__none__";

export interface InlineTextSelection {
  start: number;
  end: number;
}

export type InlineFormatKind = "bold" | "italic" | "strikethrough" | "code";
export type InlineColorKind = "text" | "background";

export type InlineFormattingCommand =
  | {
      type: "toggle_format";
      format: InlineFormatKind;
    }
  | {
      type: "set_color";
      colorKind: InlineColorKind;
      color: string;
    }
  | {
      type: "set_link";
      href: string;
    };

interface InlineSelectionPartition {
  before: InlineNode[];
  selection: InlineNode[];
  after: InlineNode[];
}

interface InlineSelectionSegments {
  leading: InlineNode[];
  core: InlineNode[];
  trailing: InlineNode[];
}

/**
 * Applies a formatting command to a non-collapsed inline text selection and
 * returns the next canonical inline source string.
 */
export function applyInlineFormatting(
  source: string,
  selection: InlineTextSelection,
  command: InlineFormattingCommand,
) {
  const normalizedSelection = normalizeSelection(selection, source.length);
  if (normalizedSelection.start === normalizedSelection.end) {
    return source;
  }

  const nodes = normalizeInlineNodes(parseInline(source));
  const partition = partitionInlineNodes(nodes, normalizedSelection);
  if (partition.selection.length === 0) {
    return source;
  }

  const nextSelection = applyCommandToSelection(partition.selection, command);
  if (areInlineNodeListsEqual(partition.selection, nextSelection)) {
    return source;
  }

  return serializeInlineNodes(
    normalizeInlineNodes([
      ...partition.before,
      ...nextSelection,
      ...partition.after,
    ]),
  );
}

function normalizeSelection(selection: InlineTextSelection, maxLength: number) {
  const start = Math.max(0, Math.min(selection.start, maxLength));
  const end = Math.max(0, Math.min(selection.end, maxLength));
  return start <= end ? { start, end } : { start: end, end: start };
}

function partitionInlineNodes(
  nodes: InlineNode[],
  selection: InlineTextSelection,
): InlineSelectionPartition {
  const [before, afterStart] = splitNodesAtOffset(nodes, selection.start);
  const [selected, after] = splitNodesAtOffset(
    afterStart,
    selection.end - selection.start,
  );

  return {
    before,
    selection: selected,
    after,
  };
}

function applyCommandToSelection(
  selection: InlineNode[],
  command: InlineFormattingCommand,
) {
  switch (command.type) {
    case "toggle_format":
      return applyToggleFormat(selection, command.format);
    case "set_color":
      return applyColor(selection, command.colorKind, command.color);
    case "set_link":
      return applyLink(selection, command.href);
  }
}

function applyToggleFormat(selection: InlineNode[], format: InlineFormatKind) {
  if (isSelectionFullyFormatted(selection, format)) {
    return normalizeInlineNodes(removeFormatFromNodes(selection, format));
  }

  const cleanedSelection = removeFormatFromNodes(selection, format);
  return normalizeInlineNodes([createFormatWrapper(format, cleanedSelection)]);
}

function applyColor(
  selection: InlineNode[],
  colorKind: InlineColorKind,
  color: string,
) {
  const normalizedColor = normalizeInlineColorToken(color);
  if (!normalizedColor) {
    return selection;
  }

  const segments =
    colorKind === "background"
      ? trimInlineSelectionWhitespace(selection)
      : {
          leading: [],
          core: selection,
          trailing: [],
        };
  if (segments.core.length === 0) {
    return selection;
  }

  if (getUniformColor(segments.core, colorKind) === normalizedColor) {
    return normalizeInlineNodes([
      ...segments.leading,
      ...removeColorFromNodes(segments.core, colorKind),
      ...segments.trailing,
    ]);
  }

  const cleanedSelection = removeColorFromNodes(segments.core, colorKind);
  return normalizeInlineNodes([
    ...segments.leading,
    createColorWrapper(colorKind, normalizedColor, cleanedSelection),
    ...segments.trailing,
  ]);
}

function applyLink(selection: InlineNode[], href: string) {
  const normalizedHref = href.trim();
  if (!normalizedHref) {
    return selection;
  }

  return normalizeInlineNodes([
    {
      type: "link",
      href: normalizedHref,
      children: removeLinksFromNodes(selection),
    },
  ]);
}

function isSelectionFullyFormatted(
  nodes: InlineNode[],
  format: InlineFormatKind,
  inherited = false,
): boolean {
  let hasText = false;
  let allFormatted = true;

  const visit = (currentNodes: InlineNode[], active: boolean) => {
    for (const node of currentNodes) {
      if (node.type === "text") {
        if (node.value.length > 0) {
          hasText = true;
          allFormatted &&= active;
        }
        continue;
      }

      if (node.type === "code") {
        if (node.value.length > 0) {
          hasText = true;
          allFormatted &&= active || format === "code";
        }
        continue;
      }

      if (node.type === "emoji" || node.type === "math_inline") {
        if (node.value.length > 0) {
          hasText = true;
          allFormatted &&= active;
        }
        continue;
      }

      if (node.type === "footnote_ref" || node.type === "line_break") {
        hasText = true;
        allFormatted &&= active;
        continue;
      }

      if (!hasInlineChildren(node)) {
        continue;
      }

      visit(node.children, active || isWrapperMatchingFormat(node, format));
    }
  };

  visit(nodes, inherited);
  return hasText && allFormatted;
}

function getUniformColor(
  nodes: InlineNode[],
  colorKind: InlineColorKind,
  inheritedColor: string | null = null,
): string | null {
  const colors = new Set<string>();

  const visit = (currentNodes: InlineNode[], activeColor: string | null) => {
    for (const node of currentNodes) {
      const nextColor =
        colorKind === "text" && node.type === "text_color"
          ? node.color
          : colorKind === "background" && node.type === "background_color"
            ? node.color
            : activeColor;

      if (node.type === "text") {
        if (node.value.length > 0) {
          colors.add(nextColor ?? NO_ACTIVE_VALUE);
        }
        continue;
      }

      if (node.type === "code") {
        if (node.value.length > 0) {
          colors.add(nextColor ?? NO_ACTIVE_VALUE);
        }
        continue;
      }

      if (node.type === "emoji" || node.type === "math_inline") {
        if (node.value.length > 0) {
          colors.add(nextColor ?? NO_ACTIVE_VALUE);
        }
        continue;
      }

      if (node.type === "footnote_ref" || node.type === "line_break") {
        colors.add(nextColor ?? NO_ACTIVE_VALUE);
        continue;
      }

      if (hasInlineChildren(node)) {
        visit(node.children, nextColor);
      }
    }
  };

  visit(nodes, inheritedColor);

  if (colors.size !== 1) {
    return null;
  }

  const [value] = colors;
  return value === NO_ACTIVE_VALUE ? null : value;
}

function removeFormatFromNodes(nodes: InlineNode[], format: InlineFormatKind): InlineNode[] {
  return nodes.flatMap((node) => removeFormatFromNode(node, format));
}

function removeFormatFromNode(node: InlineNode, format: InlineFormatKind): InlineNode[] {
  if (format === "code" && node.type === "code") {
    return node.value ? [{ type: "text", value: node.value }] : [];
  }

  if (format === "bold" && node.type === "bold_italic") {
    return [{
      type: "italic",
      children: removeFormatFromNodes(node.children, format),
    }];
  }

  if (format === "italic" && node.type === "bold_italic") {
    return [{
      type: "bold",
      children: removeFormatFromNodes(node.children, format),
    }];
  }

  if (isWrapperMatchingFormat(node, format) && hasInlineChildren(node)) {
    return removeFormatFromNodes(node.children, format);
  }

  if (!hasInlineChildren(node)) {
    return [node];
  }

  return [cloneWrapperNode(node, removeFormatFromNodes(node.children, format))];
}

function removeColorFromNodes(nodes: InlineNode[], colorKind: InlineColorKind) {
  return nodes.flatMap((node) => removeColorFromNode(node, colorKind));
}

function removeColorFromNode(node: InlineNode, colorKind: InlineColorKind): InlineNode[] {
  const shouldStrip =
    (colorKind === "text" && node.type === "text_color") ||
    (colorKind === "background" && node.type === "background_color");

  if (shouldStrip && hasInlineChildren(node)) {
    return removeColorFromNodes(node.children, colorKind);
  }

  if (!hasInlineChildren(node)) {
    return [node];
  }

  return [cloneWrapperNode(node, removeColorFromNodes(node.children, colorKind))];
}

function removeLinksFromNodes(nodes: InlineNode[]) {
  return nodes.flatMap(removeLinksFromNode);
}

function removeLinksFromNode(node: InlineNode): InlineNode[] {
  if (node.type === "link") {
    return removeLinksFromNodes(node.children);
  }

  if (!hasInlineChildren(node)) {
    return [node];
  }

  return [cloneWrapperNode(node, removeLinksFromNodes(node.children))];
}

function createFormatWrapper(format: InlineFormatKind, children: InlineNode[]): WrapperNode {
  switch (format) {
    case "bold":
      return { type: "bold", children };
    case "italic":
      return { type: "italic", children };
    case "strikethrough":
      return { type: "strikethrough", children };
    case "code":
      return { type: "code_rich", children };
  }
}

function createColorWrapper(
  colorKind: InlineColorKind,
  color: string,
  children: InlineNode[],
): WrapperNode {
  if (colorKind === "text") {
    return {
      type: "text_color",
      color,
      children,
    };
  }

  return {
    type: "background_color",
    color,
    children,
  };
}

function isWrapperMatchingFormat(node: InlineNode, format: InlineFormatKind) {
  switch (format) {
    case "bold":
      return node.type === "bold" || node.type === "bold_italic";
    case "italic":
      return node.type === "italic" || node.type === "bold_italic";
    case "strikethrough":
      return node.type === "strikethrough";
    case "code":
      return node.type === "code_rich";
  }
}

function trimInlineSelectionWhitespace(
  nodes: InlineNode[],
): InlineSelectionSegments {
  const textContent = getInlineNodesTextContent(nodes);
  const leadingWhitespaceLength = textContent.match(/^\s+/)?.[0].length ?? 0;
  const trailingWhitespaceLength = textContent.match(/\s+$/)?.[0].length ?? 0;

  if (leadingWhitespaceLength === 0 && trailingWhitespaceLength === 0) {
    return {
      leading: [],
      core: nodes,
      trailing: [],
    };
  }

  const [leading, afterLeading] = splitNodesAtOffset(nodes, leadingWhitespaceLength);
  const coreLength = Math.max(
    0,
    getInlineNodesTextLength(afterLeading) - trailingWhitespaceLength,
  );
  const [core, trailing] = splitNodesAtOffset(afterLeading, coreLength);

  return {
    leading,
    core,
    trailing,
  };
}

function getInlineNodesTextContent(nodes: InlineNode[]) {
  return nodes.map(getInlineNodeTextContent).join("");
}

function getInlineNodeTextContent(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "code":
      return node.value;
    case "emoji":
    case "math_inline":
      return node.value;
    case "footnote_ref":
      return `[^${node.label}]`;
    case "line_break":
      return "\n";
    case "image":
      return "";
    default:
      return hasInlineChildren(node)
        ? getInlineNodesTextContent(node.children)
        : "";
  }
}
