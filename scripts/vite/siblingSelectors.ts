/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   siblingSelectors.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Tailwind compiles space-y-* and divide-* to `:where(.space-y-1>:not(:last-child))`. Blink
// can neither file that under the class nor fast-reject it on an ancestor, so all 31 in the
// bundle are tried on every element at every full restyle — every palette and accent switch:
// 7.4 ms of 17.9 ms traced selector matching over 2,377 elements (SelectorStats, 2026-10-14).
// `:where(.x)>:where(:not(:last-child))` has the same zero specificity and matches the same
// elements, and puts the class where Blink's ancestor filter rejects on it first.
//
// Ponytail: only the one-class, minified shape Tailwind emits today is rewritten; a Tailwind
// release that spells it differently keeps the slow selector (slower, never wrong). It
// rewrites emitted CSS text, so the same shape inside a string or comment would change too;
// none exists in this bundle.

import type { Plugin } from "vite";

const SIBLING = /:where\(((?:\.(?:\\.|[^\s>\\{}(),])+))>:not\(:last-child\)\)/g;

export function rewriteSiblingSelectors(css: string): string {
  return css.replace(SIBLING, ":where($1)>:where(:not(:last-child))");
}

/** Rewrites the CSS assets of a production build; the dev server keeps Tailwind's text. */
export function siblingSelectors(): Plugin {
  return {
    name: "osionos-sibling-selectors",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === "asset" && asset.fileName.endsWith(".css") && typeof asset.source === "string") {
          asset.source = rewriteSiblingSelectors(asset.source);
        }
      }
    },
  };
}
