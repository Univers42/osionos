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

import type { InlineNode } from "./markdown/index";
import { normalizeInlineNodes, serializeInlineNodes } from "./inlineAst";
import {
  getElementFormattingState,
  isBlockContainerElement,
  isCanonicalInlineElement,
  type ElementFormattingState,
} from "./inlineEditorDomFormatting";

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
        INLINE_SOURCE_NORMALIZATION_PATTERN.test(source)),
    hasElementNodes: result.hasElementNodes,
    requiresElementNormalization,
  };
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
  const value = (node.textContent ?? "").replace(/\u200B/g, "");
  return value
    ? {
        nodes: [{ type: "text", value }],
        requiresNormalization: false,
        hasElementNodes: false,
      }
    : {
        nodes: [],
        requiresNormalization: false,
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
      !isCanonicalInlineElement(element, formatting),
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
