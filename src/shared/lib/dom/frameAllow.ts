/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   frameAllow.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 17:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 17:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An iframe `allow` list, cut down to what this browser recognises. A browser warns once per name
// it does not know, on every frame it creates, and a name it does not know grants nothing there:
// dropping it changes no behaviour, it only keeps the console clean. Measured 2026-11-03 (Playwright
// 1.59.1), one frame per name:
//   Chromium 147, Chrome 149 — "Unrecognized feature: 'web-share'"; document.featurePolicy lists the
//                              rest, so Chromium is asked and answers exactly.
//   Firefox 148              — "Skipping unsupported feature name" for the six names below.
//   WebKit 26.4              — no warning for any name, even an invented one: nothing is dropped.
//
// Caveat: Firefox has no API to ask, so its answer is the fixed list measured on Firefox 148. A
// name a later Firefox learns stays dropped there (a lost grant, e.g. clipboard in the node's
// frames) until it leaves the list; a name it rejects that is not listed still warns. The Gecko
// test is `mozInnerScreenX`, a Gecko-only window property: a Gecko fork without it is treated as
// WebKit and warns. Server rendering keeps the whole list.

/** Names Firefox 148 rejects in an `allow` attribute (each warns, none grants anything there). */
export const GECKO_UNSUPPORTED_FRAME_FEATURES: ReadonlySet<string> = new Set([
  "local-network-access",
  "clipboard-read",
  "clipboard-write",
  "autoplay",
  "encrypted-media",
  "picture-in-picture",
]);

type FeaturePolicyDocument = { featurePolicy?: { features(): string[] } };

function recognisedBy(doc: Document): ((name: string) => boolean) | null {
  const chromium = (doc as FeaturePolicyDocument).featurePolicy?.features();
  if (chromium) return (name) => chromium.includes(name);
  if (typeof window !== "undefined" && "mozInnerScreenX" in window) {
    return (name) => !GECKO_UNSUPPORTED_FRAME_FEATURES.has(name);
  }
  return null;
}

/** `allow` keeping only the directives this browser recognises; undefined when none is left. */
export function frameAllow(allow: string): string | undefined {
  if (typeof document === "undefined") return allow;
  const isRecognised = recognisedBy(document);
  if (!isRecognised) return allow;
  const kept = allow
    .split(";")
    .map((directive) => directive.trim())
    .filter((directive) => directive && isRecognised(directive.split(/\s+/)[0]));
  return kept.length > 0 ? kept.join("; ") : undefined;
}
