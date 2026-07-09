/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineIconInsert.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { parseIconValue } from "@/shared/lib/iconValue/iconValue";

/** UTF-8-safe base64 for arbitrary svg markup (btoa is Latin-1 only). */
function svgToBase64(svg: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(svg)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// `![](…)` parsing ends at an unbalanced `)`. CustomTab emits pasted SVGs as a
// URL-encoded `data:image/svg+xml,…` data URI, which can carry literal parens — so
// re-encode svg data URIs as base64 (paren-free) for a robust inline round-trip.
// http(s) URLs keep balanced parens (findDestinationClose already handles those).
function toInlineSafeImageSrc(src: string): string {
  const trimmed = src.trim();
  const encoded = /^data:image\/svg\+xml,(.*)$/is.exec(trimmed);
  if (!encoded) return trimmed;
  try {
    return `data:image/svg+xml;base64,${svgToBase64(decodeURIComponent(encoded[1]))}`;
  } catch {
    return trimmed;
  }
}

// SVG loaded via <img> can't read `currentColor`, so bake a concrete stroke at insert:
// the picker's chosen color, else the live theme ink. ponytail: baked, so a later theme
// switch leaves the inline icon its insert-time color — upgrade to a css-var svg if needed.
function resolvedIconColor(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof document !== "undefined") {
    const ink = getComputedStyle(document.documentElement)
      .getPropertyValue("--osio-fg-default")
      .trim();
    if (ink) return ink;
  }
  return "#111111";
}

// A lucide icon has no markdown token, so render it to an SVG data-URI <img> at insert.
// lucide + react-dom/server are dynamic-imported so they never enter the warm chunk.
async function lucideIconToDataUri(name: string, color?: string): Promise<string | null> {
  try {
    const imports = (await import("lucide-react/dynamicIconImports")).default as Record<
      string,
      () => Promise<{ default: React.ComponentType<{ size?: number; color?: string }> }>
    >;
    const loader = imports[name];
    if (!loader) return null;
    const { default: Icon } = await loader();
    const { renderToStaticMarkup } = await import("react-dom/server");
    const svg = renderToStaticMarkup(
      React.createElement(Icon, { size: 20, color: resolvedIconColor(color) }),
    );
    if (!svg.startsWith("<svg")) return null;
    return `data:image/svg+xml;base64,${svgToBase64(svg)}`;
  } catch {
    return null;
  }
}

/**
 * The markdown a picked icon inserts inline. Emoji -> the bare char (inherits the block
 * font-size, no fixed wrapper). Custom image / uploaded SVG / URL -> an inline `![](src)`
 * image. Lucide icon -> its rendered SVG as a data-URI image, so all three visual kinds
 * collapse to one round-trippable inline `<img>`. `null` -> insert nothing.
 */
export async function inlineIconInsertText(value: string): Promise<string | null> {
  const parsed = parseIconValue(value);
  if (!parsed) return null;
  if (parsed.kind === "emoji") return parsed.ref;
  if (parsed.kind === "image") {
    const src = toInlineSafeImageSrc(parsed.ref);
    return src ? `![](${src})` : null;
  }
  const src = await lucideIconToDataUri(parsed.ref, parsed.color);
  return src ? `![](${src})` : null;
}
