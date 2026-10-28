/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableExpression.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The inside of `{{ NAME | filter:"arg" | filter }}`. The markdown engine already
 * guaranteed the shape (a name, then `|`-separated segments with no `{`, `}`, `|`
 * or newline), so this only splits it; filter names are checked by the resolver.
 */
export interface VariableFilter {
  name: string;
  arg?: string;
}

export interface VariableExpression {
  name: string;
  filters: VariableFilter[];
}

const FILTER_RE = /^([A-Za-z_]\w*)\s*(?::\s*(?:"([^"]*)"|'([^']*)'|(\S.*?)))?$/;
const CACHE_LIMIT = 500;
const cache = new Map<string, VariableExpression | null>();

function parseFilter(segment: string): VariableFilter | null {
  const match = FILTER_RE.exec(segment.trim());
  if (!match) return null;
  const arg = match[2] ?? match[3] ?? match[4]?.trim();
  return arg === undefined ? { name: match[1] } : { name: match[1], arg };
}

/** `null` when a filter segment is malformed (`| :x`, `| a b`). */
export function parseVariableExpression(expr: string): VariableExpression | null {
  const cached = cache.get(expr);
  if (cached !== undefined) return cached;
  const [head, ...segments] = expr.split("|");
  const filters: VariableFilter[] = [];
  let parsed: VariableExpression | null = { name: head.trim(), filters };
  for (const segment of segments) {
    const filter = parseFilter(segment);
    if (!filter) {
      parsed = null;
      break;
    }
    filters.push(filter);
  }
  // Typing `{{X | date:"…"}}` one key at a time would otherwise grow the map without bound.
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(expr, parsed);
  return parsed;
}
