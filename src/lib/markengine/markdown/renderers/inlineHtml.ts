/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineHtml.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:22:32 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:26:57 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { InlineNode } from "../ast";
import {
  getInlineBackgroundCss,
  getInlineCodeCss,
  getInlineTextColorCss,
  shouldSuppressInlineBackground,
  unwrapCodeRichStyles,
} from "./inlineStyleHelpers";

export interface InlineHtmlOptions {
  resolveInternalLinkTitle?: (pageId: string) => { title: string; icon?: string } | null;
  renderInlineMath?: (source: string) => string;
  renderInlineMathAsSource?: boolean;
}

export function renderInlineNodesToHtml(nodes: InlineNode[], options: InlineHtmlOptions = {}): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return esc(node.value);
        case "bold":
          return `<strong>${renderInlineNodesToHtml(node.children, options)}</strong>`;
        case "italic":
          return `<em style="font-style:italic">${renderInlineNodesToHtml(node.children, options)}</em>`;
        case "bold_italic":
          return `<strong><em style="font-style:italic">${renderInlineNodesToHtml(node.children, options)}</em></strong>`;
        case "strikethrough":
          return `<del style="text-decoration-color:currentColor">${renderInlineNodesToHtml(node.children, options)}</del>`;
        case "underline":
          return `<u>${renderInlineNodesToHtml(node.children, options)}</u>`;
        case "text_color":
          return `<span data-inline-type="text_color" data-inline-color="${esc(node.color)}" style="${getInlineTextColorCss(node.color)}">${renderInlineNodesToHtml(node.children, options)}</span>`;
        case "background_color":
          return `<span data-inline-type="background_color" data-inline-color="${esc(node.color)}" style="${getInlineBackgroundCss(node.color, shouldSuppressInlineBackground(node.children))}">${renderInlineNodesToHtml(node.children, options)}</span>`;
        case "code_rich": {
          const {
            nodes: codeChildren,
            textColor,
            backgroundColor,
          } = unwrapCodeRichStyles(node.children);
          const style = getInlineCodeCss(textColor, backgroundColor);
          return `<code class="inline-code" data-inline-type="code" style="${style}">${renderInlineNodesToHtml(codeChildren, options)}</code>`;
        }
        case "code":
          return `<code class="inline-code" data-inline-type="code" style="${getInlineCodeCss()}">${esc(node.value)}</code>`;
        case "link":
          return `<a 
            href="${esc(node.href)}" 
            target="_blank" 
            rel="noopener noreferrer"
            class="editor-link"
          >${renderInlineNodesToHtml(node.children, options)}</a>\u200B`;
        case "internal_link": {
          const resolved = options.resolveInternalLinkTitle?.(node.pageId);
          const title = resolved?.title || node.pageId;
          const icon = resolved?.icon ? `<span style="margin-right:4px">${resolved.icon}</span>` : "";
          
          return `<span 
            class="editor-mention page-mention-placeholder" 
            data-page-id="${esc(node.pageId)}"
            contenteditable="false"
          >${icon}${esc(title)}</span>\u200B`;
        }
        case "image":
          return `<img src="${esc(node.src)}" alt="${esc(node.alt)}" />`;
        case "highlight":
          return `<mark>${renderInlineNodesToHtml(node.children, options)}</mark>`;
        case "math_inline": {
          if (options?.renderInlineMathAsSource) return esc(`$${node.value}$`);
          const rendered = options?.renderInlineMath?.(node.value);
          if (rendered) return `<span class="math-inline" data-inline-type="math_inline" data-inline-math-source="${esc(node.value)}" contenteditable="false">${rendered}</span>`;
          return `<span class="math-inline">${esc(node.value)}</span>`;
        }
        case "emoji":
          return node.value;
        case "line_break":
          return "<br />";
        case "footnote_ref":
          return `<sup>[${esc(node.label)}]</sup>`;
        default:
          return "";
      }
    })
    .join("");
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
