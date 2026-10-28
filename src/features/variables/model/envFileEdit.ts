/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   envFileEdit.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { VARIABLE_LIMITS, VARIABLE_NAME_RE } from "./variableDefinitions";

const FULL = "add it to another file: an env.<topic>.json next to this one is read with it";

/**
 * `source` with `"name": "value"` appended as its last entry. The file is also edited by
 * hand, so the text is spliced rather than re-serialised: indentation, key order and the
 * final newline stay as the writer left them. A refusal names the reason and changes nothing.
 */
export function addVariableToSource(source: string, name: string, value: string): { source: string } | { error: string } {
  if (!VARIABLE_NAME_RE.test(name)) return { error: `"${name}": names start with a letter or _ and use letters, digits, _ or -` };
  if (value.length > VARIABLE_LIMITS.valueChars) return { error: `the value is over ${VARIABLE_LIMITS.valueChars} characters` };
  let root: unknown = {};
  try {
    if (source.trim()) root = JSON.parse(source);
  } catch {
    return { error: "this env.json is not valid JSON; fix it first" };
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return { error: "this env.json must be an object of NAME: value" };
  const names = Object.keys(root);
  if (names.includes(name)) return { error: `${name} is already in this env.json` };
  if (names.length >= VARIABLE_LIMITS.count) return { error: `this env.json holds ${VARIABLE_LIMITS.count} variables; ${FULL}` };
  const entry = `${JSON.stringify(name)}: ${JSON.stringify(value)}`;
  const close = source.lastIndexOf("}");
  const next = names.length === 0
    ? `{\n  ${entry}\n}${source.trim() ? source.slice(close + 1) : "\n"}`
    : `${source.slice(0, close).trimEnd()},\n${source.match(/^([ \t]+)"/m)?.[1] ?? "  "}${entry}\n${source.slice(close)}`;
  if (next.length > VARIABLE_LIMITS.sourceChars) return { error: `this env.json would pass ${VARIABLE_LIMITS.sourceChars} characters; ${FULL}` };
  return { source: next };
}
