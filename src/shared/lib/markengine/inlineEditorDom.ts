/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineEditorDom.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/16 22:23:33 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/16 22:23:34 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { InlineNode } from "./markdown/ast";
import { normalizeInlineNodes, serializeInlineNodes } from "./inlineAst";
import {
  getElementFormattingState,
  isBlockContainerElement,
  isCanonicalInlineElement,
  type ElementFormattingState,
} from "./inlineEditorDomFormatting";
import { containsBareUrlShape } from "./markdown/parserInlineMatchers";

// The char-class trigger deliberately excludes `.` and `/` (they abound in prose), so a
// bare scheme-less URL (`www.foo.com`) never matched — its live autolink re-render is
// gated below via containsBareUrlShape instead.
const INLINE_SOURCE_NORMALIZATION_PATTERN = /[[\]_*~`:$!<\\=]/;

interface DomReadResult {
  nodes: InlineNode[];
  requiresNormalization: boolean;
  hasElementNodes: boolean;
}

export interface InlineEditorDomState {
  nodes: InlineNode[];
  source: string;
  requiresNormalization: boolean;
  hasElementNodes: boolean;
  requiresElementNormalization: boolean;
}

/**
 * Reads the current `contentEditable` DOM and converts it into markengine inline AST.
 * The DOM stays as an implementation detail of the editor while the serialized source
 * and normalization decisions come from the AST model.
 */
export function readInlineEditorDomState(
  root: HTMLElement,
): InlineEditorDomState {
  const result = readDomChildNodes(Array.from(root.childNodes));
  const rawSource = serializeInlineNodes(result.nodes);
  const nodes = normalizeInlineNodes(result.nodes);
  const source = serializeInlineNodes(nodes);
  const requiresStructuralNormalization = rawSource !== source;
  const requiresElementNormalization =
    result.hasElementNodes &&
    (result.requiresNormalization || requiresStructuralNormalization);

  return {
    nodes,
    source,
    requiresNormalization:
      requiresElementNormalization ||
      (!result.hasElementNodes &&
        (INLINE_SOURCE_NORMALIZATION_PATTERN.test(source) ||
          containsBareUrlShape(source))),
    hasElementNodes: result.hasElementNodes,
    requiresElementNormalization,
  };
}

/**
 * The caret's offset in the SERIALIZED SOURCE (bracket) space — not the visible
 * plain-text offset. Clones the DOM from the root start up to the caret and runs
 * it through the SAME reader/serializer, so a prior rendered span (`[b]x[/b]`)
 * contributes its full bracket length. This is what lets the markdown autoformat
 * fire on the 2nd, 3rd, … inline style in a block (where DOM plain-text offset ≠
 * source offset), not only the first.
 *
 * Correct at the fire moment: a just-typed closing delimiter leaves the caret in a
 * PLAIN TEXT node (the raw markdown, not yet rendered), so the clone never splits a
 * wrapper — prior wrappers are fully contained and serialize exactly.
 */
export function inlineSourceCaretOffset(root: HTMLElement, range: Range): number {
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const holder = document.createElement("div");
  holder.appendChild(prefix.cloneContents());
  return serializeInlineNodes(
    normalizeInlineNodes(readDomChildNodes(Array.from(holder.childNodes)).nodes),
  ).length;
}

function readDomChildNodes(childNodes: Node[]): DomReadResult {
  const nodes: InlineNode[] = [];
  let requiresNormalization = false;
  let hasElementNodes = false;

  for (const childNode of childNodes) {
    const childResult = readDomNode(childNode);
    nodes.push(...childResult.nodes);
    requiresNormalization ||= childResult.requiresNormalization;
    hasElementNodes ||= childResult.hasElementNodes;
  }

  return {
    nodes,
    requiresNormalization,
    hasElementNodes,
  };
}

function readDomNode(node: Node): DomReadResult {
  if (node.nodeType === Node.TEXT_NODE) {
    return readTextNode(node);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return {
      nodes: [],
      requiresNormalization: false,
      hasElementNodes: false,
    };
  }

  return readElementNode(node as HTMLElement);
}

function readTextNode(node: Node): DomReadResult {
  const raw = node.textContent ?? "";
  const value = raw.replaceAll("\u200B", "");
  // A stripped ZWSP flags a re-render so a transient caret CARRIER (inserted by the
  // autoformat mark-exit, setInlineCaretAfterStyledBoundary) is cleaned once the user
  // types into it \u2192 the text stays "boldX", not "bold\u200BX". Scoped to a carrier
  // that now holds text (value.length > 0): a BARE ZWSP node \u2014 the persistent
  // trailing suffix links/mentions render \u2014 is left untouched, so link editing and
  // the page picker are unaffected.
  const requiresNormalization = value.length > 0 && raw.length !== value.length;
  return value
    ? {
        nodes: [{ type: "text", value }],
        requiresNormalization,
        hasElementNodes: false,
      }
    : {
        nodes: [],
        requiresNormalization,
        hasElementNodes: false,
      };
}

function readElementNode(element: HTMLElement): DomReadResult {
  if (element.tagName === "BR") {
    return {
      nodes: [{ type: "line_break" }],
      requiresNormalization: false,
      hasElementNodes: true,
    };
  }

  if (element.tagName === "IMG") {
    return readImageElement(element);
  }

  const formatting = getElementFormattingState(element);

  // If this is an internal link (page mention), treat it as an atomic node
  // and ignore its internal HTML structure (icon, title text).
  if (formatting.internalPageId) {
    return {
      nodes: [{ type: "internal_link", pageId: formatting.internalPageId }],
      requiresNormalization: !isCanonicalInlineElement(element, formatting),
      hasElementNodes: true,
    };
  }

  const childResult = readDomChildNodes(Array.from(element.childNodes));
  if (isBlockContainerElement(element)) {
    return {
      nodes: childResult.nodes,
      requiresNormalization: true,
      hasElementNodes: true,
    };
  }

  const nodes = applyElementFormatting(childResult.nodes, formatting);

  return {
    nodes,
    requiresNormalization:
      childResult.requiresNormalization ||
      !isCanonicalInlineElement(element, formatting) ||
      nodes.length === 0,
    hasElementNodes: true,
  };
}

function readImageElement(element: HTMLElement): DomReadResult {
  const src = element.getAttribute("src");
  const alt = element.getAttribute("alt") ?? "";
  const title = element.getAttribute("title") ?? undefined;

  if (!src) {
    return {
      nodes: [],
      requiresNormalization: true,
      hasElementNodes: true,
    };
  }

  return {
    nodes: [{ type: "image", src, alt, title }],
    requiresNormalization: false,
    hasElementNodes: true,
  };
}

function applyElementFormatting(
  nodes: InlineNode[],
  formatting: ElementFormattingState,
): InlineNode[] {
  if (nodes.length === 0) {
    return nodes;
  }

  let currentNodes = nodes;

  if (formatting.linkHref) {
    currentNodes = [
      {
        type: "link",
        href: formatting.linkHref,
        title: formatting.linkTitle ?? undefined,
        children: currentNodes,
      },
    ];
  }

  if (formatting.bold) {
    currentNodes = [{ type: "bold", children: currentNodes }];
  }

  if (formatting.italic) {
    currentNodes = [{ type: "italic", children: currentNodes }];
  }

  if (formatting.strikethrough) {
    currentNodes = [{ type: "strikethrough", children: currentNodes }];
  }

  if (formatting.underline) {
    currentNodes = [{ type: "underline", children: currentNodes }];
  }

  if (formatting.highlight) {
    currentNodes = [{ type: "highlight", children: currentNodes }];
  }

  if (formatting.textColor) {
    currentNodes = [
      {
        type: "text_color",
        color: formatting.textColor,
        children: currentNodes,
      },
    ];
  }

  if (formatting.backgroundColor) {
    currentNodes = [
      {
        type: "background_color",
        color: formatting.backgroundColor,
        children: currentNodes,
      },
    ];
  }

  if (formatting.code) {
    let codeChildren = currentNodes;

    if (formatting.codeTextColor) {
      codeChildren = [
        {
          type: "text_color",
          color: formatting.codeTextColor,
          children: codeChildren,
        },
      ];
    }

    if (formatting.codeBackgroundColor) {
      codeChildren = [
        {
          type: "background_color",
          color: formatting.codeBackgroundColor,
          children: codeChildren,
        },
      ];
    }

    currentNodes = [{ type: "code_rich", children: codeChildren }];
  }

  return currentNodes;
}
