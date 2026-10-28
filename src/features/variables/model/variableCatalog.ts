/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableCatalog.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { BUILT_IN_NAMES, propertyKey } from "./variableResolver";
import type { VariablePlacement } from "./variableScope";

/** One row of the `{{` menu: `insert` is what goes between the braces (or after `|`). */
export interface VariableSuggestion {
  insert: string;
  /** Where it comes from: which env.json, which page's property, a built-in, or what a filter does. */
  source: string;
}

const NAME_RE = /^[A-Za-z_][\w.-]*$/;

export const FILTER_SUGGESTIONS: readonly VariableSuggestion[] = [
  { insert: 'date:"medium"', source: "format a date" },
  { insert: "relative", source: "in 3 days, last week" },
  { insert: 'add:"1d"', source: "shift a date (or add to a number)" },
  { insert: 'number:"decimal"', source: "format a number" },
  { insert: "upper", source: "UPPERCASE" },
  { insert: "lower", source: "lowercase" },
  { insert: 'default:"—"', source: "shown when empty or unknown" },
];

/**
 * Every name a page can use, the one that would win first: its env.json layers
 * innermost first, then its own and inherited properties, then the built-ins a
 * definition does not shadow.
 */
export function variableSuggestions({ layers, owners, pages }: VariablePlacement): VariableSuggestion[] {
  const seen = new Set<string>();
  const out: VariableSuggestion[] = [];
  const add = (insert: string, source: string) => {
    if (seen.has(insert)) return;
    seen.add(insert);
    out.push({ insert, source });
  };
  layers.forEach((layer, i) => {
    const owner = owners[i];
    for (const name of layer.keys()) add(name, owner ? `env.json · ${owner.title || "Untitled"}` : "env.json");
  });
  const properties = new Set<string>();
  pages.forEach((page, depth) => {
    for (const property of page.properties ?? []) {
      const key = propertyKey(property.label || property.key);
      if (properties.has(key)) continue;
      properties.add(key);
      // A label the grammar can't hold (accents, punctuation) falls back to the key.
      const name = [`page.${property.label.trim().replace(/\s+/g, "_")}`, `page.${property.key}`].find((n) => NAME_RE.test(n));
      if (name) add(name, depth === 0 ? "property" : `property · ${page.title || "Untitled"}`);
    }
  });
  for (const name of BUILT_IN_NAMES) add(name, "built-in");
  return out;
}

/** Prefix matches first, then the rest that contain the query; each group keeps catalog order. */
export function rankSuggestions(items: readonly VariableSuggestion[], query: string, limit: number): VariableSuggestion[] {
  const wanted = query.toLowerCase();
  if (!wanted) return items.slice(0, limit);
  const prefix: VariableSuggestion[] = [];
  const inside: VariableSuggestion[] = [];
  for (const item of items) {
    const at = item.insert.toLowerCase().indexOf(wanted);
    if (at === 0) prefix.push(item);
    else if (at > 0) inside.push(item);
  }
  return [...prefix, ...inside].slice(0, limit);
}
