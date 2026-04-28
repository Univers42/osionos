/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   renderer.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:27:50 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:27:51 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  BlockNode,
  DocumentNode,
  InlineNode,
  ListItemNode,
  ListNode,
} from "./types";
import {
  resolveIndexedMarkdownMode,
  resolveMarkdownMode,
  type MarkdownModeResolver,
  type MarkdownModeState,
  type MarkdownViewMode,
} from "./render-mode";
import { escapeHtml } from "./utils";

export interface RenderHtmlOptions {
  mode?: MarkdownViewMode;
  blockModes?: MarkdownViewMode[];
  resolveBlockMode?: MarkdownModeResolver<BlockNode>;
}

function renderInlines(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return escapeHtml(node.value);
        case "emphasis":
          return `<em data-node-id="${node.id}">${renderInlines(node.children)}</em>`;
        case "strong":
          return `<strong data-node-id="${node.id}">${renderInlines(node.children)}</strong>`;
        case "code_span":
          return `<code data-node-id="${node.id}" class="md-inline-code">${escapeHtml(node.value)}</code>`;
        case "link":
          return `<a data-node-id="${node.id}" href="${escapeHtml(node.href)}">${renderInlines(node.children)}</a>`;
        default:
          return "";
      }
    })
    .join("");
}

function renderListItem(item: ListItemNode, state: MarkdownModeState): string {
  const blockStateAttr = ` data-block-state="${state.getBlockState()}"`;
  const checkedAttr =
    typeof item.checked === "boolean"
      ? ` data-checked="${String(item.checked)}"`
      : "";
  const content = item.children
    .map((node) => renderBlock(node, state))
    .join("");
  return `<li data-node-id="${item.id}"${blockStateAttr}${checkedAttr}>${content}</li>`;
}

function renderList(node: ListNode, state: MarkdownModeState): string {
  const tag = node.ordered ? "ol" : "ul";
  const start = node.ordered && node.start > 1 ? ` start="${node.start}"` : "";
  const blockStateAttr = ` data-block-state="${state.getBlockState()}"`;
  return `<${tag} data-node-id="${node.id}"${blockStateAttr}${start}>${node.items.map((item) => renderListItem(item, state)).join("")}</${tag}>`;
}

function renderBlock(node: BlockNode, state: MarkdownModeState): string {
  const blockStateAttr = ` data-block-state="${state.getBlockState()}"`;
  switch (node.kind) {
    case "paragraph":
      return `<p data-node-id="${node.id}"${blockStateAttr}>${renderInlines(node.children)}</p>`;
    case "heading":
      return `<h${node.depth} data-node-id="${node.id}"${blockStateAttr}>${renderInlines(node.children)}</h${node.depth}>`;
    case "code_block": {
      const languageClass = node.language
        ? ` language-${escapeHtml(node.language)}`
        : "";
      return `<pre data-node-id="${node.id}"${blockStateAttr} class="md-code-block${languageClass}"><code>${escapeHtml(node.value)}</code></pre>`;
    }
    case "list":
      return renderList(node, state);
    case "blockquote":
      return `<blockquote data-node-id="${node.id}"${blockStateAttr}>${node.children.map((child) => renderBlock(child, state)).join("")}</blockquote>`;
    case "thematic_break":
      return `<hr data-node-id="${node.id}"${blockStateAttr} />`;
    case "list_item":
      return renderListItem(node, state);
    default:
      return "";
  }
}

export function renderHtml(
  ast: DocumentNode,
  options: RenderHtmlOptions = {},
): string {
  if (!options.blockModes && !options.resolveBlockMode) {
    const state = resolveMarkdownMode(options.mode);
    return ast.children.map((node) => renderBlock(node, state)).join("\n");
  }

  return ast.children
    .map((node, index) => {
      const state = resolveIndexedMarkdownMode(
        options.mode,
        index,
        node,
        options.blockModes,
        options.resolveBlockMode,
      );
      return renderBlock(node, state);
    })
    .join("\n");
}
