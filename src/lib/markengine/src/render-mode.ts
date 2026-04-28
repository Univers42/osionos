/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   render-mode.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:22:09 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:22:10 by dlesieur         ###   ########.fr       */
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

export function resolveMarkdownMode(
  mode?: MarkdownViewMode,
): MarkdownModeState {
  switch (mode) {
    case "source":
      return new SourceMode();
    case "live-preview":
      return new LivePreviewMode();
    case "reading":
    default:
      return new ReadingMode();
  }
}

export function resolveIndexedMarkdownMode<TNode>(
  fallbackMode: MarkdownViewMode | undefined,
  index: number,
  node: TNode,
  indexedModes?: readonly MarkdownViewMode[],
  resolver?: MarkdownModeResolver<TNode>,
): MarkdownModeState {
  const mode = resolver?.(index, node) ?? indexedModes?.[index] ?? fallbackMode;
  return resolveMarkdownMode(mode);
}
