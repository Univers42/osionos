/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   renderCore.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type MarkdownViewMode = "source" | "live-preview" | "reading";

export type MarkdownModeResolver<TNode> = (
  index: number,
  node: TNode,
) => MarkdownViewMode | undefined;

export interface MarkdownModeState {
  readonly name: MarkdownViewMode;
  getBlockState(): MarkdownViewMode;
  shouldHideMarkdownSymbols(): boolean;
}

export class SourceMode implements MarkdownModeState {
  public readonly name: MarkdownViewMode = "source";

  public getBlockState(): MarkdownViewMode {
    return this.name;
  }

  public shouldHideMarkdownSymbols(): boolean {
    return false;
  }
}

export class LivePreviewMode implements MarkdownModeState {
  public readonly name: MarkdownViewMode = "live-preview";

  public getBlockState(): MarkdownViewMode {
    return this.name;
  }

  public shouldHideMarkdownSymbols(): boolean {
    return true;
  }
}

export class ReadingMode implements MarkdownModeState {
  public readonly name: MarkdownViewMode = "reading";

  public getBlockState(): MarkdownViewMode {
    return this.name;
  }

  public shouldHideMarkdownSymbols(): boolean {
    return true;
  }
}

const SOURCE_MODE = new SourceMode();
const LIVE_PREVIEW_MODE = new LivePreviewMode();
const READING_MODE = new ReadingMode();

export function resolveMarkdownMode(
  mode?: MarkdownViewMode,
): MarkdownModeState {
  switch (mode) {
    case "source":
      return SOURCE_MODE;
    case "live-preview":
      return LIVE_PREVIEW_MODE;
    case "reading":
    default:
      return READING_MODE;
  }
}

export function resolveIndexedMarkdownMode<TNode>(
  fallbackMode: MarkdownViewMode | undefined,
  index: number,
  node: TNode,
  indexedModes?: readonly MarkdownViewMode[],
  resolver?: MarkdownModeResolver<TNode>,
): MarkdownModeState {
  return resolveMarkdownMode(
    resolver?.(index, node) ?? indexedModes?.[index] ?? fallbackMode,
  );
}

const HTML_ESCAPE_PATTERN = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replaceAll(HTML_ESCAPE_PATTERN, (char) => HTML_ESCAPE_MAP[char]);
}

export function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

export function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = stripUrlControlAndSpaceChars(trimmed);
  const schemeMatch = /^([a-z][a-z\d+.-]*):/i.exec(normalized);
  if (!schemeMatch) return trimmed;

  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel") {
    return trimmed;
  }

  return "";
}

function stripUrlControlAndSpaceChars(value: string): string {
  let result = "";
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x20 || codePoint === 0x7F) continue;
    result += char;
  }
  return result;
}