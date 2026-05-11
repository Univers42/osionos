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
  return nodes.map((node) => renderInlineNodeToHtml(node, o)).join("");
}

function renderChildren(nodes: InlineNode[], options: ResolvedInlineHtmlOptions): string {
  return renderInlineNodesToHtml(nodes, options);
}

function renderCodeRich(node: Extract<InlineNode, { type: "code_rich" }>, options: ResolvedInlineHtmlOptions): string {
  const { nodes: codeChildren, textColor, backgroundColor } = unwrapCodeRichStyles(node.children);
  const style = getInlineCodeCss(textColor, backgroundColor);
  return `<code class="inline-code" data-inline-type="code" style="${style}">${renderChildren(codeChildren, options)}</code>`;
}

function renderLink(node: Extract<InlineNode, { type: "link" }>, options: ResolvedInlineHtmlOptions): string {
  const href = sanitizeUrl(node.href);
  const attrs = [
    `href="${esc(href || "#")}"`,
    node.title ? `title="${esc(node.title)}"` : "",
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

function renderImage(node: Extract<InlineNode, { type: "image" }>): string {
  const src = sanitizeUrl(node.src);
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
