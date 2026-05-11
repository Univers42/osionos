/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineDocument.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/11 21:03:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 21:03:59 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { InlineNode } from "./markdown/ast";
import { parseInline } from "./markdown/parser";
import {
  renderInlineNodesToHtml,
  type InlineHtmlOptions,
} from "./markdown/renderers/inlineHtml";
import { normalizeInlineNodes, serializeInlineNodes } from "./inlineAst";
import {
  applyInlineFormattingToNodes,
  type InlineFormattingCommand,
  type InlineTextSelection,
} from "./inlineFormatting";
import {
  applyInlineTextEditToNodes,
  type InlineTextEditCommand,
} from "./inlineTextEditing";

export interface InlineDocumentEditResult {
  doc: InlineDocument;
  selection: InlineTextSelection;
}

export class InlineDocument {
  private sourceCache: string | null;
  private defaultHtmlCache: string | null = null;
  private htmlOptionsCache: InlineHtmlOptions | null = null;
  private htmlCache: string | null = null;

  private constructor(
    private readonly inlineNodes: InlineNode[],
    sourceCache: string | null = null,
  ) {
    this.sourceCache = sourceCache;
  }

  static fromSource(source: string): InlineDocument {
    return new InlineDocument(normalizeInlineNodes(parseInline(source)), source);
  }

  applyFormatting(
    selection: InlineTextSelection,
    command: InlineFormattingCommand,
  ): InlineDocument {
    const nextNodes = applyInlineFormattingToNodes(
      this.inlineNodes,
      selection,
      command,
    );
    return nextNodes === this.inlineNodes ? this : new InlineDocument(nextNodes);
  }

  applyEdit(
    selection: InlineTextSelection,
    command: InlineTextEditCommand,
  ): InlineDocumentEditResult {
    const result = applyInlineTextEditToNodes(
      this.inlineNodes,
      selection,
      command,
    );
    return {
      doc:
        result.nodes === this.inlineNodes
          ? this
          : new InlineDocument(result.nodes),
      selection: result.selection,
    };
  }

  toSource(): string {
    this.sourceCache ??= serializeInlineNodes(this.inlineNodes);
    return this.sourceCache;
  }

  toHtml(options?: InlineHtmlOptions): string {
    if (!options) {
      this.defaultHtmlCache ??= renderInlineNodesToHtml(this.inlineNodes);
      return this.defaultHtmlCache;
    }

    if (this.htmlOptionsCache === options && this.htmlCache !== null) {
      return this.htmlCache;
    }

    this.htmlOptionsCache = options;
    this.htmlCache = renderInlineNodesToHtml(this.inlineNodes, options);
    return this.htmlCache;
  }

  nodes(): readonly InlineNode[] {
    return this.inlineNodes;
  }
}
