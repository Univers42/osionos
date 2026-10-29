/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineSource.ts                                    :+:      :+:    :+:   */
/*                                                    Reputation         */
/*   By: dlesieur <dlesieur@student.42.fr>          Reputation         */
/*                                                Reputation           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The inline source, in two currencies.
 *
 * A block's content is inline markdown SOURCE ("**bold**"); the editor works
 * in PLAIN TEXT offsets (the length of the rendered text). These two helpers
 * translate between them — slice a range of the source while keeping the
 * formatting around it, and read a source string as plain text.
 *
 * They live here (not in the block editor) because both the editor and the
 * plain components that host an inline editor need them.
 */

import {
  getInlineNodesTextLength,
  parseInline,
  serializeInlineNodes,
  splitNodesAtOffset,
  type InlineNode,
} from "@osionos/markdown-engine";

/** Slice inline source by plain-text offsets, preserving formatting tokens. */
export function sliceInlineSource(source: string, from: number, to?: number): string {
  const nodes = parseInline(source);
  const total = getInlineNodesTextLength(nodes);
  const clampedFrom = Math.max(0, Math.min(from, total));
  const clampedTo = Math.max(clampedFrom, Math.min(to ?? total, total));
  const [, tail] = splitNodesAtOffset(nodes, clampedFrom);
  const [middle] = splitNodesAtOffset(tail, clampedTo - clampedFrom);
  return serializeInlineNodes(middle);
}

/** Plain text (markup stripped) of an inline source string. */
export function plainTextOfInlineSource(source: string): string {
  const walk = (nodes: InlineNode[]): string =>
    nodes
      .map((node) => {
        if ("children" in node && Array.isArray(node.children)) return walk(node.children);
        if ("value" in node && typeof node.value === "string") return node.value;
        return "";
      })
      .join("");
  return walk(parseInline(source));
}
