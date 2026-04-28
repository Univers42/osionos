/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   source-renderer.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:27:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:27:53 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { escapeHtml } from "./utils";
import {
  resolveIndexedMarkdownMode,
  resolveMarkdownMode,
  type MarkdownModeResolver,
  type MarkdownViewMode,
} from "./render-mode";

export interface SourceRenderOptions {
  showLineNumbers?: boolean;
  mode?: MarkdownViewMode;
  hideMarkdownSymbols?: boolean;
  lineModes?: MarkdownViewMode[];
  resolveLineMode?: MarkdownModeResolver<string>;
}

interface MarkdownSymbolDecorator {
  marker(value: string): string;
  task(value: string): string;
}

function span(className: string, value: string, hidden: boolean): string {
  const hiddenClass = hidden ? " md-src-symbol-hidden" : "";
  const ariaHidden = hidden ? ' aria-hidden="true"' : "";
  return `<span class="${className}${hiddenClass}"${ariaHidden}>${esc(value)}</span>`;
}

class VisibleMarkdownSymbolDecorator implements MarkdownSymbolDecorator {
  public marker(value: string): string {
    return span("md-src-marker", value, false);
  }

  public task(value: string): string {
    return span("md-src-task", value, false);
  }
}

class HiddenMarkdownSymbolDecorator implements MarkdownSymbolDecorator {
  public marker(value: string): string {
    return span("md-src-marker", value, true);
  }

  public task(value: string): string {
    return span("md-src-task", value, true);
  }
}

function createMarkdownSymbolDecorator(
  hideMarkdownSymbols: boolean,
): MarkdownSymbolDecorator {
  return hideMarkdownSymbols
    ? new HiddenMarkdownSymbolDecorator()
    : new VisibleMarkdownSymbolDecorator();
}

function esc(value: string): string {
  return escapeHtml(value);
}

function renderDelimitedToken(
  token: string,
  delimiterLength: number,
  typeClass: string,
  decorator: MarkdownSymbolDecorator,
): string {
  const open = token.slice(0, delimiterLength);
  const close = token.slice(token.length - delimiterLength);
  const value = token.slice(delimiterLength, token.length - delimiterLength);
  return [
    decorator.marker(open),
    `<span class="${typeClass}">${esc(value)}</span>`,
    decorator.marker(close),
  ].join("");
}

function renderInlineToken(
  token: string,
  decorator: MarkdownSymbolDecorator,
): string {
  if (token.startsWith("`") && token.endsWith("`")) {
    return [
      decorator.marker("`"),
      `<span class="md-src-code">${esc(token.slice(1, -1))}</span>`,
      decorator.marker("`"),
    ].join("");
  }

  if (token.startsWith("**") && token.endsWith("**")) {
    return renderDelimitedToken(token, 2, "md-src-strong", decorator);
  }

  if (token.startsWith("*") && token.endsWith("*")) {
    return renderDelimitedToken(token, 1, "md-src-emphasis", decorator);
  }

  if (token.startsWith("~~") && token.endsWith("~~")) {
    return renderDelimitedToken(token, 2, "md-src-strike", decorator);
  }

  const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
  if (imageMatch) {
    return [
      decorator.marker("!"),
      decorator.marker("["),
      `<span class="md-src-link-text">${esc(imageMatch[1])}</span>`,
      decorator.marker("]"),
      decorator.marker("("),
      `<span class="md-src-link-url">${esc(imageMatch[2])}</span>`,
      decorator.marker(")"),
    ].join("");
  }

  const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
  if (linkMatch) {
    return [
      decorator.marker("["),
      `<span class="md-src-link-text">${esc(linkMatch[1])}</span>`,
      decorator.marker("]"),
      decorator.marker("("),
      `<span class="md-src-link-url">${esc(linkMatch[2])}</span>`,
      decorator.marker(")"),
    ].join("");
  }

  if (/^\[[ xX]\]$/.test(token)) {
    return decorator.task(token);
  }

  return esc(token);
}

const INLINE_TOKEN_PATTERNS: RegExp[] = [
  /`[^`]*`/,
  /\*\*[^*]+\*\*/,
  /\*[^*]+\*/,
  /~~[^~]+~~/,
  /!\[[^\]]*\]\([^)]+\)/,
  /\[[^\]]+\]\([^)]+\)/,
  /\[[ xX]\]/,
];

function findNextInlineToken(
  line: string,
  fromIndex: number,
): { index: number; token: string } | null {
  let bestIndex = Number.POSITIVE_INFINITY;
  let bestToken = "";

  for (const pattern of INLINE_TOKEN_PATTERNS) {
    const search = new RegExp(pattern.source, "g");
    search.lastIndex = fromIndex;
    const match = search.exec(line);
    if (!match) continue;
    if (match.index < bestIndex) {
      bestIndex = match.index;
      bestToken = match[0];
    }
  }

  if (!Number.isFinite(bestIndex)) return null;
  return { index: bestIndex, token: bestToken };
}

function renderInline(
  line: string,
  decorator: MarkdownSymbolDecorator,
): string {
  let out = "";
  let cursor = 0;

  while (cursor < line.length) {
    const match = findNextInlineToken(line, cursor);
    if (!match) {
      out += esc(line.slice(cursor));
      break;
    }
    if (match.index > cursor) {
      out += esc(line.slice(cursor, match.index));
    }
    out += renderInlineToken(match.token, decorator);
    cursor = match.index + match.token.length;
  }

  return out;
}

function renderLine(line: string, decorator: MarkdownSymbolDecorator): string {
  const headingMatch = /^(\s{0,3})(#{1,6})(\s+)(.*)$/.exec(line);
  if (headingMatch) {
    return [
      esc(headingMatch[1]),
      decorator.marker(headingMatch[2]),
      esc(headingMatch[3]),
      renderInline(headingMatch[4], decorator),
    ].join("");
  }

  const fenceMatch = /^(\s*)(```+|~~~+)(.*)$/.exec(line);
  if (fenceMatch) {
    return [
      esc(fenceMatch[1]),
      decorator.marker(fenceMatch[2]),
      `<span class="md-src-lang">${esc(fenceMatch[3])}</span>`,
    ].join("");
  }

  const quoteMatch = /^(\s*)(>+\s?)(.*)$/.exec(line);
  if (quoteMatch) {
    return [
      esc(quoteMatch[1]),
      decorator.marker(quoteMatch[2]),
      renderInline(quoteMatch[3], decorator),
    ].join("");
  }

  const listMatch = /^(\s*)([-*+]\s+|\d+[.)]\s+)(\[[ xX]\]\s+)?(.*)$/.exec(
    line,
  );
  if (listMatch) {
    return [
      esc(listMatch[1]),
      decorator.marker(listMatch[2]),
      listMatch[3] ? decorator.task(listMatch[3]) : "",
      renderInline(listMatch[4], decorator),
    ].join("");
  }

  if (/^(\s*)([-*_]\s*){3,}$/.test(line)) {
    return decorator.marker(line);
  }

  return renderInline(line, decorator);
}

export function renderMarkdownSource(
  source: string,
  options: SourceRenderOptions = {},
): string {
  const modeState = resolveMarkdownMode(options.mode);
  const lines = source.replaceAll(/\r\n?/g, "\n").split("\n");
  const content = lines
    .map((line, index) => {
      const lineState = resolveIndexedMarkdownMode(
        options.mode,
        index,
        line,
        options.lineModes,
        options.resolveLineMode,
      );
      const hideMarkdownSymbols =
        options.hideMarkdownSymbols ?? lineState.shouldHideMarkdownSymbols();
      const decorator = createMarkdownSymbolDecorator(hideMarkdownSymbols);
      const lineNumber = options.showLineNumbers
        ? `<span class="md-src-lineno">${index + 1}</span>`
        : "";
      return `<span class="md-src-line" data-block-state="${lineState.getBlockState()}">${lineNumber}<span class="md-src-code-line">${renderLine(line, decorator)}</span></span>`;
    })
    .join("\n");

  return `<pre class="md-source-view" data-mode="${modeState.name}"><code>${content}</code></pre>`;
}
