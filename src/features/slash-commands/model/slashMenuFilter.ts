/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashMenuFilter.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The matching of the slash menu: the typed query, the command token, and the
 * ranking.
 *
 * Pure — no JSX, no React — so the whole of the menu's matching is testable
 * under `node --experimental-strip-types` (the catalog itself holds JSX and
 * cannot be loaded there).
 */

import type { SlashCommand } from "./types";

export interface SlashQuery {
  /** The block/command token — the first whitespace-delimited word after "/". */
  command: string;
  /** Everything after the first space — an argument like the color in "/color gray". */
  arg: string;
}

/** Split the text typed after "/" into a command token and an optional argument.
 *  This is what lets "/color gray" keep matching the "color" command while carrying
 *  "gray" as an argument: a space no longer folds into the match and empties the list. */
export function parseSlashQuery(filter: string): SlashQuery {
  const trimmed = filter.replace(/^\s+/, "");
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { command: trimmed, arg: "" };
  return { command: trimmed.slice(0, spaceIdx), arg: trimmed.slice(spaceIdx + 1).trim() };
}

function wordStartsWith(haystack: string, needle: string): boolean {
  return haystack.split(/\s+/).some((word) => word.startsWith(needle));
}

/** Relevance score of a command against the token (0 = no match). Ranked so an
 * exact/prefix label hit floats above an incidental word/alias hit — typing
 * "page" surfaces "Page" before "Layout" (the old over-match). Description and id
 * are intentionally NOT searched: they were the noise that surfaced non-matches. */
function scoreCommand(item: SlashCommand, token: string): number {
  const label = item.label.toLowerCase();
  const aliases = (item.aliases ?? []).map((alias) => alias.toLowerCase());
  // Exact LABEL beats exact alias: "Database - Full page" ships keyword "page",
  // which must not tie with (and then alphabetically outrank) the "Page" command.
  if (label === token) return 100;
  if (aliases.includes(token)) return 90;
  if (label.startsWith(token)) return 80;
  if (aliases.some((alias) => alias.startsWith(token))) return 60;
  if (wordStartsWith(label, token)) return 50;
  if (aliases.some((alias) => wordStartsWith(alias, token))) return 40;
  if (label.includes(token)) return 25;
  if (aliases.some((alias) => alias.includes(token))) return 15;
  if ("blockType" in item && item.blockType.toLowerCase().includes(token)) return 10;
  return 0;
}

/** Filter + rank a catalog by the command token (the arg after a space is ignored
 *  here — it is consumed by the selected command). Empty token → the whole catalog. */
export function filterSlashCommandsFrom(catalog: SlashCommand[], filter: string): SlashCommand[] {
  const token = parseSlashQuery(filter).command.toLowerCase();
  if (!token) return catalog;

  return catalog
    .map((item) => ({ item, score: scoreCommand(item, token) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label))
    .map((entry) => entry.item);
}
