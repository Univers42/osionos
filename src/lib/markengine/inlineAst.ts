/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineAst.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/16 22:23:48 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/16 22:23:49 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { InlineNode } from "./markdown/index";

export type WrapperNode = Extract<
  InlineNode,
  {
    children: InlineNode[];
  }
>;

type ColorWrapperNode =
  | Extract<InlineNode, { type: "text_color" }>
  | Extract<InlineNode, { type: "background_color" }>;

type LinkWrapperNode = Extract<InlineNode, { type: "link" }>;

export function splitNodesAtOffset(
  nodes: InlineNode[],
  offset: number,
): [InlineNode[], InlineNode[]] {
  if (offset <= 0) {
    return [[], nodes.slice()];
  }

  const totalLength = getInlineNodesTextLength(nodes);
  if (offset >= totalLength) {
    return [nodes.slice(), []];
  }

  const left: InlineNode[] = [];
  const right: InlineNode[] = [];
  let consumed = 0;

  for (const node of nodes) {
    const nodeLength = getInlineNodeTextLength(node);
    if (consumed >= offset) {
      right.push(node);
      continue;
    }

    if (consumed + nodeLength <= offset) {
      left.push(node);
      consumed += nodeLength;
      continue;
    }

    const [nodeLeft, nodeRight] = splitNodeAtOffset(node, offset - consumed);
    left.push(...nodeLeft);
    right.push(...nodeRight);
    consumed = offset;
  }

  return [normalizeInlineNodes(left), normalizeInlineNodes(right)];
}

export function getInlineNodesTextLength(nodes: InlineNode[]) {
  return nodes.reduce((total, node) => total + getInlineNodeTextLength(node), 0);
}

export function normalizeInlineNodes(nodes: InlineNode[]): InlineNode[] {
  const normalizedNodes: InlineNode[] = [];

  for (const node of nodes) {
    for (const nextNode of normalizeInlineNode(node)) {
      const previousNode = normalizedNodes.at(-1);
      if (!previousNode) {
        normalizedNodes.push(nextNode);
        continue;
      }

      if (previousNode.type === "text" && nextNode.type === "text") {
        previousNode.value += nextNode.value;
        continue;
      }

      if (
        hasInlineChildren(previousNode) &&
        hasInlineChildren(nextNode) &&
        canMergeSiblingWrappers(previousNode, nextNode)
      ) {
        previousNode.children = normalizeInlineNodes([
          ...previousNode.children,
          ...nextNode.children,
        ]);
        continue;
      }

      normalizedNodes.push(nextNode);
    }
  }

  return normalizedNodes;
}

export function serializeInlineNodes(nodes: InlineNode[]): string {
  return nodes.map(serializeInlineNode).join("");
}

/**
 * Performs a structural equality check for two inline node lists without
 * serializing them first. This keeps formatting hot paths independent from
 * `JSON.stringify` allocations.
 */
export function areInlineNodeListsEqual(left: InlineNode[], right: InlineNode[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!areInlineNodesEqual(left[index], right[index])) {
      return false;
    }
  }

  return true;
}

export function hasInlineChildren(node: InlineNode): node is WrapperNode {
  switch (node.type) {
    case "bold":
    case "italic":
    case "bold_italic":
    case "strikethrough":
    case "underline":
    case "text_color":
    case "background_color":
    case "code_rich":
    case "link":
    case "highlight":
      return true;
    default:
      return false;
  }
}

export function cloneWrapperNode(
  node: WrapperNode,
  children: InlineNode[],
): WrapperNode {
  switch (node.type) {
    case "text_color":
      return { type: "text_color", color: node.color, children };
    case "background_color":
      return { type: "background_color", color: node.color, children };
    case "link":
      return { type: "link", href: node.href, title: node.title, children };
    default:
      return { ...node, children };
  }
}

/**
 * Performs a structural equality check for a single inline node.
 */
export function areInlineNodesEqual(left: InlineNode, right: InlineNode): boolean {
  if (left.type !== right.type) {
    return false;
  }

  switch (left.type) {
    case "text":
    case "code":
    case "math_inline": {
      const next = right as typeof left;
      return left.value === next.value;
    }
    case "emoji": {
      const next = right as typeof left;
      return left.value === next.value && left.raw === next.raw;
    }
    case "footnote_ref": {
      const next = right as typeof left;
      return left.label === next.label;
    }
    case "internal_link": {
      const next = right as typeof left;
      return left.pageId === next.pageId;
    }
    case "line_break":
      return true;
    case "image": {
      const next = right as typeof left;
      return (
        left.src === next.src &&
        left.alt === next.alt &&
        left.title === next.title
      );
    }
    case "link": {
      const next = right as typeof left;
      return (
        left.href === next.href &&
        left.title === next.title &&
        areInlineNodeListsEqual(left.children, next.children)
      );
    }
    case "text_color":
    case "background_color": {
      const next = right as typeof left;
      return (
        left.color === next.color &&
        areInlineNodeListsEqual(left.children, next.children)
      );
    }
    default:
      return hasInlineChildren(left) &&
        hasInlineChildren(right)
        ? areInlineNodeListsEqual(left.children, right.children)
        : false;
  }
}

function splitNodeAtOffset(
  node: InlineNode,
  offset: number,
): [InlineNode[], InlineNode[]] {
  if (offset <= 0) {
    return [[], [node]];
  }

  const nodeLength = getInlineNodeTextLength(node);
  if (offset >= nodeLength) {
    return [[node], []];
  }

  if (node.type === "text") {
    return [
      [{ type: "text", value: node.value.slice(0, offset) }],
      [{ type: "text", value: node.value.slice(offset) }],
    ];
  }

  if (node.type === "code") {
    return [
      [{ type: "code", value: node.value.slice(0, offset) }],
      [{ type: "code", value: node.value.slice(offset) }],
    ];
  }

  if (
    node.type === "emoji" ||
    node.type === "math_inline" ||
    node.type === "footnote_ref" ||
    node.type === "line_break" ||
    node.type === "internal_link"
  ) {
    return offset > 0 ? [[node], []] : [[], [node]];
  }

  if (node.type === "image" || !hasInlineChildren(node)) {
    return [[], [node]];
  }

  const [leftChildren, rightChildren] = splitNodesAtOffset(node.children, offset);
  return [
    leftChildren.length > 0 ? [cloneWrapperNode(node, leftChildren)] : [],
    rightChildren.length > 0 ? [cloneWrapperNode(node, rightChildren)] : [],
  ];
}

function getInlineNodeTextLength(node: InlineNode): number {
  switch (node.type) {
    case "text":
      return node.value.length;
    case "code":
      return node.value.length;
    case "emoji":
      return node.value.length;
    case "math_inline":
      return node.value.length;
    case "footnote_ref":
      return node.label.length + 2;
    case "internal_link":
      return node.pageId.length + 9; // "[[page:ID]]"
    case "line_break":
      return 1;
    case "image":
      return 0;
    default:
      return hasInlineChildren(node)
        ? getInlineNodesTextLength(node.children)
        : 0;
  }
}

function normalizeInlineNode(node: InlineNode): InlineNode[] {
  if (node.type === "text") {
    return node.value ? [node] : [];
  }

  if (node.type === "code") {
    return node.value ? [node] : [];
  }

  if (node.type === "emoji" || node.type === "math_inline") {
    return node.value ? [node] : [];
  }

  if (
    node.type === "footnote_ref" ||
    node.type === "line_break" ||
    node.type === "image" ||
    node.type === "internal_link"
  ) {
    return [node];
  }

  if (!hasInlineChildren(node)) {
    return [node];
  }

  const normalizedChildren = normalizeInlineNodes(node.children);
  if (normalizedChildren.length === 0) {
    return [];
  }

  if (normalizedChildren.length === 1) {
    const [onlyChild] = normalizedChildren;
    if (shouldReplaceWrapperWithChild(node, onlyChild)) {
      return [onlyChild];
    }
  }

  const flattenedChildren = normalizedChildren.flatMap((child) =>
    canFlattenNestedWrapper(node, child) ? child.children : [child],
  );

  return [cloneWrapperNode(node, flattenedChildren)];
}

function serializeInlineNode(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "bold":
      return `[b]${serializeInlineNodes(node.children)}[/b]`;
    case "italic":
      return `[i]${serializeInlineNodes(node.children)}[/i]`;
    case "bold_italic":
      return `[b][i]${serializeInlineNodes(node.children)}[/i][/b]`;
    case "strikethrough":
      return `[s]${serializeInlineNodes(node.children)}[/s]`;
    case "underline":
      return `[u]${serializeInlineNodes(node.children)}[/u]`;
    case "text_color":
      return `[color=${node.color}]${serializeInlineNodes(node.children)}[/color]`;
    case "background_color":
      return `[bg=${node.color}]${serializeInlineNodes(node.children)}[/bg]`;
    case "code_rich":
      return `[code]${serializeInlineNodes(node.children)}[/code]`;
    case "code":
      return `\`${node.value}\``;
    case "link": {
      const title = node.title ? ` "${node.title}"` : "";
      return `[${serializeInlineNodes(node.children)}](${node.href}${title})`;
    }
    case "image": {
      const title = node.title ? ` "${node.title}"` : "";
      return `![${node.alt}](${node.src}${title})`;
    }
    case "internal_link":
      return `[[page:${node.pageId}]]`;
    case "line_break":
      return "\n";
    case "highlight":
      return `[mark]${serializeInlineNodes(node.children)}[/mark]`;
    case "math_inline":
      return `$${node.value}$`;
    case "footnote_ref":
      return `[^${node.label}]`;
    case "emoji":
      return node.value;
  }
}

function canFlattenNestedWrapper(
  parent: WrapperNode,
  child: InlineNode,
): child is WrapperNode {
  if (!hasInlineChildren(child) || parent.type !== child.type) {
    return false;
  }

  if (isColorWrapper(parent) && isColorWrapper(child)) {
    return parent.color === child.color;
  }

  if (isLinkWrapper(parent) && isLinkWrapper(child)) {
    return parent.href === child.href && parent.title === child.title;
  }

  return true;
}

function shouldReplaceWrapperWithChild(
  parent: WrapperNode,
  child: InlineNode,
): child is WrapperNode {
  if (!hasInlineChildren(child) || parent.type !== child.type) {
    return false;
  }

  if (isColorWrapper(parent) && isColorWrapper(child)) {
    return parent.color !== child.color;
  }

  if (isLinkWrapper(parent) && isLinkWrapper(child)) {
    return parent.href !== child.href || parent.title !== child.title;
  }

  return false;
}

function canMergeSiblingWrappers(left: WrapperNode, right: WrapperNode) {
  if (left.type !== right.type) {
    return false;
  }

  if (isColorWrapper(left) && isColorWrapper(right)) {
    return left.color === right.color;
  }

  if (isLinkWrapper(left) && isLinkWrapper(right)) {
    return left.href === right.href && left.title === right.title;
  }

  return true;
}

function isColorWrapper(node: WrapperNode): node is ColorWrapperNode {
  return node.type === "text_color" || node.type === "background_color";
}

function isLinkWrapper(node: WrapperNode): node is LinkWrapperNode {
  return node.type === "link";
}
