/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineHtml.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
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
import { escapeHtml, isExternalUrl, sanitizeUrl } from "../../renderCore";

export interface InlineHtmlOptions {
  classPrefix?: string;
  editorChrome?: boolean;
  externalLinks?: boolean;
  resolveInternalLinkTitle?: (pageId: string) => { title: string; icon?: string } | null;
  renderInlineMath?: (source: string) => string;
  renderInlineMathAsSource?: boolean;
  // When set, links render as their raw `[text](url)` source instead of an <a> —
  // the inline "reveal" the editor's Ctrl/Cmd-click link editor toggles on, so a
  // link can be edited as markdown in place (symmetric to renderInlineMathAsSource).
  renderLinkAsSource?: boolean;
}

const DEFAULT_INLINE_HTML_OPTIONS: Required<
  Pick<InlineHtmlOptions, "classPrefix" | "editorChrome" | "externalLinks">
> = {
  classPrefix: "md",
  editorChrome: true,
  externalLinks: true,
};

type ResolvedInlineHtmlOptions = InlineHtmlOptions & typeof DEFAULT_INLINE_HTML_OPTIONS;

export function renderInlineNodesToHtml(nodes: InlineNode[], options: InlineHtmlOptions = {}): string {
  const o = { ...DEFAULT_INLINE_HTML_OPTIONS, ...options };
  let html = "";
  for (const node of nodes) {
    html += renderInlineNodeToHtml(node, o);
  }
  return html;
}

function renderChildren(nodes: InlineNode[], options: ResolvedInlineHtmlOptions): string {
  return renderInlineNodesToHtml(nodes, options);
}

function renderCodeRich(node: Extract<InlineNode, { type: "code_rich" }>, options: ResolvedInlineHtmlOptions): string {
  const { nodes: codeChildren, textColor, backgroundColor } = unwrapCodeRichStyles(node.children);
  const style = getInlineCodeCss(textColor, backgroundColor);
  return `<code class="inline-code" data-inline-type="code" style="${style}">${renderChildren(codeChildren, options)}</code>`;
}

function inlineNodesToPlainText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text" || n.type === "code" || n.type === "emoji") return n.value;
      if ("children" in n && Array.isArray(n.children)) return inlineNodesToPlainText(n.children);
      return "";
    })
    .join("");
}

function renderLink(node: Extract<InlineNode, { type: "link" }>, options: ResolvedInlineHtmlOptions): string {
  // Raw-source reveal: emit the editable `[text](url)` markdown (node.href is the
  // source-truth href, so an empty `[label]()` round-trips instead of becoming `#`).
  if (options.renderLinkAsSource) {
    const title = node.title ? ` "${node.title}"` : "";
    return esc(`[${inlineNodesToPlainText(node.children)}](${node.href}${title})`);
  }
  const href = sanitizeUrl(node.href);
  const attrs = [
    `href="${esc(href || "#")}"`,
    node.title ? `title="${esc(node.title)}"` : options.editorChrome ? 'title="Ctrl/\u2318-click to edit \u00B7 click to open"' : "",
    options.editorChrome ? 'class="editor-link"' : "",
    options.externalLinks && isExternalUrl(href) ? 'target="_blank" rel="noopener noreferrer"' : "",
  ].filter(Boolean).join(" ");
  const suffix = options.editorChrome ? "\u200B" : "";
  return `<a ${attrs}>${renderChildren(node.children, options)}</a>${suffix}`;
}

function renderInternalLink(node: Extract<InlineNode, { type: "internal_link" }>, options: ResolvedInlineHtmlOptions): string {
  const resolved = options.resolveInternalLinkTitle?.(node.pageId);
  const title = resolved?.title || node.pageId;
  const icon = resolved?.icon ? `<span style="margin-right:4px">${esc(resolved.icon)}</span>` : "";
  const suffix = options.editorChrome ? "\u200B" : "";
  return `<span class="editor-mention page-mention-placeholder" data-page-id="${esc(node.pageId)}" contenteditable="false">${icon}${esc(title)}</span>${suffix}`;
}

// sanitizeUrl drops every non-http(s) scheme, which would blank an uploaded / pasted
// / lucide-derived asset. `data:image/*` is safe in an <img src> (SVG loaded via <img>
// cannot run scripts), so allow the image data-URI explicitly for inline media.
function sanitizeInlineImageSrc(value: string): string {
  const trimmed = value.trim();
  if (/^data:image\//i.test(trimmed)) return trimmed;
  return sanitizeUrl(trimmed);
}

function renderImage(node: Extract<InlineNode, { type: "image" }>): string {
  const src = sanitizeInlineImageSrc(node.src);
  const title = node.title ? ` title="${esc(node.title)}"` : "";
  return src ? `<img src="${esc(src)}" alt="${esc(node.alt)}"${title} />` : "";
}

function renderInlineMath(node: Extract<InlineNode, { type: "math_inline" }>, options: ResolvedInlineHtmlOptions): string {
  if (options.renderInlineMathAsSource) return esc(`$${node.value}$`);
  const rendered = options.renderInlineMath?.(node.value);
  if (rendered) return `<span class="math-inline" data-inline-type="math_inline" data-inline-math-source="${esc(node.value)}" contenteditable="false">${rendered}</span>`;
  return `<span class="${options.classPrefix}-math-inline">${esc(node.value)}</span>`;
}

function renderInlineNodeToHtml(node: InlineNode, options: ResolvedInlineHtmlOptions): string {
  switch (node.type) {
    case "text":
      return esc(node.value);
    case "bold":
      return `<strong>${renderChildren(node.children, options)}</strong>`;
    case "italic":
      return `<em style="font-style:italic">${renderChildren(node.children, options)}</em>`;
    case "bold_italic":
      return `<strong><em style="font-style:italic">${renderChildren(node.children, options)}</em></strong>`;
    case "strikethrough":
      return `<del style="text-decoration-color:currentColor">${renderChildren(node.children, options)}</del>`;
    case "underline":
      return `<u>${renderChildren(node.children, options)}</u>`;
    case "text_color":
      return `<span data-inline-type="text_color" data-inline-color="${esc(node.color)}" style="${getInlineTextColorCss(node.color)}">${renderChildren(node.children, options)}</span>`;
    case "background_color":
      return `<span data-inline-type="background_color" data-inline-color="${esc(node.color)}" style="${getInlineBackgroundCss(node.color, shouldSuppressInlineBackground(node.children))}">${renderChildren(node.children, options)}</span>`;
    case "code_rich":
      return renderCodeRich(node, options);
    case "code":
      return `<code class="inline-code" data-inline-type="code" style="${getInlineCodeCss()}">${esc(node.value)}</code>`;
    case "link":
      return renderLink(node, options);
    case "internal_link":
      return renderInternalLink(node, options);
    case "image":
      return renderImage(node);
    case "highlight":
      return `<mark>${renderChildren(node.children, options)}</mark>`;
    case "math_inline":
      return renderInlineMath(node, options);
    case "emoji":
      return node.value;
    case "line_break":
      return "<br />";
    case "footnote_ref":
      return `<sup>[${esc(node.label)}]</sup>`;
    default:
      return "";
  }
}

function esc(s: string): string {
  return escapeHtml(s);
}
