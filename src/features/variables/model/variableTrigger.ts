/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableTrigger.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The open `{{…` at the end of a block's text, which drives the variable menu: a name
 * being typed, or a filter being typed after `|`. It reads the whole tail rather than
 * the last keystroke, so several characters coalesced into one change still open it.
 *
 * Caveat: it reads the source text, so `{{` typed inside a code span opens the menu
 * too (a pick there inserts literal text), and only the end of the text is seen — a
 * `{{` typed mid-sentence opens nothing; type the name.
 */
export interface VariableTrigger {
  /** Index of the `{{`. */
  start: number;
  mode: "name" | "filter";
  /** The variable name; in name mode, what is typed so far. */
  name: string;
  /** What the menu filters on: the partial name or the partial filter. */
  query: string;
}

const NAME_RE = /^[A-Za-z_][\w.-]*$/;
const PARTIAL_NAME_RE = /^\s*[\w.-]*$/;
const PARTIAL_FILTER_RE = /^\s*[a-z]*$/i;
const MAX_TAIL = 200;

export function matchVariableTrigger(text: string): VariableTrigger | null {
  const start = text.lastIndexOf("{{");
  if (start < 0 || text[start - 1] === "\\") return null;
  const tail = text.slice(start + 2);
  if (tail.length > MAX_TAIL || /[{}\n]/.test(tail)) return null;
  const parts = tail.split("|");
  const name = parts[0].trim();
  if (parts.length === 1) return PARTIAL_NAME_RE.test(tail) ? { start, mode: "name", name, query: name } : null;
  const partial = parts[parts.length - 1];
  if (!NAME_RE.test(name) || !PARTIAL_FILTER_RE.test(partial)) return null;
  return { start, mode: "filter", name, query: partial.trim() };
}

/** `text` with its open trigger completed by `insert` (a name, or a filter with its argument); null when none is open. */
export function applyVariableInsert(text: string, insert: string): string | null {
  const trigger = matchVariableTrigger(text);
  if (!trigger) return null;
  if (trigger.mode === "name") return `${text.slice(0, trigger.start)}{{${insert}}}`;
  return `${text.slice(0, text.lastIndexOf("|") + 1)} ${insert}}}`;
}
