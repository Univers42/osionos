/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineEditorDomFormatting.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:21:42 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:21:43 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { normalizeInlineColorToken } from "./inlineTextStyles";

export interface ElementFormattingState {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  highlight: boolean;
  textColor: string | null;
  backgroundColor: string | null;
  linkHref: string | null;
  linkTitle: string | null;
  internalPageId: string | null;
  code: boolean;
  codeTextColor: string | null;
  codeBackgroundColor: string | null;
}

type FormattingKind =
  | "bold"
  | "italic"
  | "strikethrough"
  | "underline"
  | "highlight"
  | "textColor"
  | "backgroundColor"
  | "link"
  | "internal_link"
  | "code";

/**
 * Returns true when the element is a block container that should be flattened
 * back into inline children during DOM -> AST conversion.
 */
export function isBlockContainerElement(element: HTMLElement) {
  return element.tagName === "DIV" || element.tagName === "P";
}

/**
 * Captures every inline formatting signal that the editor supports from a DOM
 * element so DOM reading stays independent from AST transformation.
 */
export function getElementFormattingState(
  element: HTMLElement,
): ElementFormattingState {
  const code = isCodeElement(element);

  return {
    bold: isBoldElement(element),
    italic: isItalicElement(element),
    strikethrough: isStrikeElement(element),
    underline: isUnderlineElement(element),
    highlight: isHighlightElement(element),
    textColor: getTextColor(element),
    backgroundColor: getBackgroundColor(element),
    linkHref: getLinkHref(element),
    linkTitle: getLinkTitle(element),
    internalPageId: getInternalPageId(element),
    code,
    codeTextColor: code ? getCodeTextColor(element) : null,
    codeBackgroundColor: code ? getCodeBackgroundColor(element) : null,
  };
}

/**
 * Returns true when the element already matches the canonical inline HTML that
 * markengine emits for the detected formatting state.
 */
export function isCanonicalInlineElement(
  element: HTMLElement,
  formatting: ElementFormattingState,
) {
  switch (element.tagName) {
    case "A":
      return Boolean(formatting.linkHref) && hasOnlyFormatting(formatting, ["link"]);
    case "STRONG":
      return hasOnlyFormatting(formatting, ["bold"]);
    case "EM":
      return hasOnlyFormatting(formatting, ["italic"]);
    case "DEL":
      return hasOnlyFormatting(formatting, ["strikethrough"]);
    case "U":
      return hasOnlyFormatting(formatting, ["underline"]);
    case "MARK":
      return hasOnlyFormatting(formatting, ["highlight"]);
    case "CODE":
      return (
        element.dataset.inlineType === "code" &&
        hasOnlyFormatting(formatting, ["code"])
      );
    case "SPAN":
      if (formatting.internalPageId) {
        return (
          element.classList.contains("page-mention-placeholder") &&
          hasOnlyFormatting(formatting, ["internal_link"])
        );
      }

      if (element.dataset.inlineType === "text_color" && formatting.textColor) {
        return hasOnlyFormatting(formatting, ["textColor"]);
      }

      if (
        element.dataset.inlineType === "background_color" &&
        formatting.backgroundColor
      ) {
        return hasOnlyFormatting(formatting, ["backgroundColor"]);
      }

      return false;
    default:
      return false;
  }
}

function hasOnlyFormatting(
  formatting: ElementFormattingState,
  allowedKinds: ReadonlyArray<FormattingKind>,
) {
  return getActiveFormattingKinds(formatting).every((kind) =>
    allowedKinds.includes(kind),
  );
}

function getActiveFormattingKinds(formatting: ElementFormattingState) {
  const activeKinds: FormattingKind[] = [];

  if (formatting.bold) {
    activeKinds.push("bold");
  }

  if (formatting.italic) {
    activeKinds.push("italic");
  }

  if (formatting.strikethrough) {
    activeKinds.push("strikethrough");
  }

  if (formatting.underline) {
    activeKinds.push("underline");
  }

  if (formatting.highlight) {
    activeKinds.push("highlight");
  }

  if (formatting.textColor) {
    activeKinds.push("textColor");
  }

  if (formatting.backgroundColor) {
    activeKinds.push("backgroundColor");
  }

  if (formatting.linkHref) {
    activeKinds.push("link");
  }

  if (formatting.internalPageId) {
    activeKinds.push("internal_link");
  }

  if (formatting.code) {
    activeKinds.push("code");
  }

  return activeKinds;
}

function isBoldElement(element: HTMLElement) {
  if (element.dataset.inlineType === "bold") {
    return true;
  }

  if (element.tagName === "STRONG" || element.tagName === "B") {
    return true;
  }

  const fontWeight = element.style.fontWeight;
  return fontWeight === "bold" || Number(fontWeight) >= 600;
}

function isItalicElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === "italic" ||
    element.tagName === "EM" ||
    element.tagName === "I" ||
    element.style.fontStyle === "italic"
  );
}

function isStrikeElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === "strikethrough" ||
    element.tagName === "DEL" ||
    element.tagName === "S" ||
    element.tagName === "STRIKE" ||
    element.style.textDecoration.includes("line-through")
  );
}

function isUnderlineElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === "underline" ||
    element.tagName === "U" ||
    element.style.textDecoration.includes("underline")
  );
}

function isHighlightElement(element: HTMLElement) {
  return element.dataset.inlineType === "highlight" || element.tagName === "MARK";
}

function isCodeElement(element: HTMLElement) {
  return element.dataset.inlineType === "code" || element.tagName === "CODE";
}

function getLinkHref(element: HTMLElement) {
  if (element.tagName !== "A") {
    return null;
  }

  const href = element.getAttribute("href");
  return href?.trim() ? href : null;
}

function getLinkTitle(element: HTMLElement) {
  if (element.tagName !== "A") {
    return null;
  }

  const title = element.getAttribute("title");
  return title?.trim() ? title : null;
}

function getInternalPageId(element: HTMLElement) {
  return element.dataset.pageId || null;
}

function getTextColor(element: HTMLElement) {
  return (
    normalizeDomColorToken(
      element.dataset.inlineType === "text_color"
        ? element.dataset.inlineColor
        : null,
    ) ??
    normalizeDomColorToken(element.style.color) ??
    normalizeDomColorToken(element.getAttribute("color"))
  );
}

function getBackgroundColor(element: HTMLElement) {
  return (
    normalizeDomColorToken(
      element.dataset.inlineType === "background_color"
        ? element.dataset.inlineColor
        : null,
    ) ??
    normalizeDomColorToken(element.style.backgroundColor)
  );
}

function getCodeTextColor(element: HTMLElement) {
  return normalizeDomColorToken(
    element.style.getPropertyValue("--inline-code-color"),
  );
}

function getCodeBackgroundColor(element: HTMLElement) {
  return normalizeDomColorToken(
    stripHexAlphaSuffix(
      element.style.getPropertyValue("--inline-code-background"),
    ),
  );
}

function normalizeDomColorToken(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return normalizeInlineColorToken(value.trim());
}

function stripHexAlphaSuffix(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/);
  return match ? `#${match[1]}` : normalized;
}
