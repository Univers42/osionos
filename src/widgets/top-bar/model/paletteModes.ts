/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paletteModes.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The top bar is the one entry point: what the query starts with decides what
// it searches. Typing '?' lists these modes. Pure: the bar passes in the flag
// and the actions, so every row here is testable without a browser.

import type { PaletteCommand } from "./commands";
import { matchCommands, type PaletteResult } from "./search";
import { SETTING_PREFIX } from "./settingRows";

export type PaletteMode = "search" | "command" | "setting" | "ask" | "help" | "people" | "messages";

export interface PaletteModeInfo {
  mode: Exclude<PaletteMode, "search">;
  prefix: string;
  label: string;
  hint: string;
}

/** What the bar can search right now. Message search exists only behind its flag. */
export interface PaletteScope {
  messages: boolean;
}

/** Every prefixed mode, in the order '?' lists them. */
export const PALETTE_MODES: readonly PaletteModeInfo[] = [
  { mode: "command", prefix: ">", label: "Commands", hint: "Run any command" },
  { mode: "setting", prefix: SETTING_PREFIX, label: "Settings", hint: "Change theme, density, side bar… in place" },
  { mode: "ask", prefix: "/", label: "Ask Binocle", hint: "Hand a question to the assistant" },
  { mode: "people", prefix: "@", label: "People", hint: "Find a person" },
  { mode: "messages", prefix: "#", label: "Messages", hint: "Search chat messages" },
  { mode: "help", prefix: "?", label: "Help", hint: "These modes and the help commands" },
];

/** The modes this scope offers. */
export function visibleModes(scope: PaletteScope): readonly PaletteModeInfo[] {
  return scope.messages ? PALETTE_MODES : PALETTE_MODES.filter((info) => info.mode !== "messages");
}

/** The mode a query selects and the text searched in it. A prefix only counts
 *  as the first character; a leading space makes the rest a plain search. */
export function parsePaletteQuery(query: string, scope: PaletteScope): { mode: PaletteMode; term: string } {
  const info = visibleModes(scope).find((candidate) => candidate.prefix === query.charAt(0));
  return info ? { mode: info.mode, term: query.slice(1) } : { mode: "search", term: query };
}

/** `text` as a query that searches it as written, even when it starts with a
 *  prefix ("#1 roadmap"): a leading space, which every search trims. */
export function literalQuery(text: string): string {
  return PALETTE_MODES.some((info) => info.prefix === text.charAt(0)) ? ` ${text}` : text;
}

/** The mode's visible name; search has none. */
export function paletteModeLabel(mode: PaletteMode): string {
  return PALETTE_MODES.find((info) => info.mode === mode)?.label ?? "Search";
}

/** What an empty term in each mode shows instead of "nothing found". */
export function paletteModeHint(mode: PaletteMode): string {
  return PALETTE_MODES.find((info) => info.mode === mode)?.hint ?? "Type to search pages, people and messages";
}

const noop = () => undefined;
const HELP_GROUP = "Help";
/** Its row would only narrow the bar to '>', which the Commands mode row already does. */
const SHOW_ALL_COMMANDS = "help.commands";

/** '?': one row per other mode (choosing it narrows the bar to that prefix),
 *  then the Help menu's commands, all filtered by the term. */
export function helpRows(term: string, commands: PaletteCommand[], scope: PaletteScope): PaletteResult[] {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const modes = visibleModes(scope)
    .filter((info) => info.mode !== "help")
    .filter((info) => words.every((word) => `${info.label} ${info.hint}`.toLowerCase().includes(word)))
    .map((info): PaletteResult => ({
      id: `mode:${info.mode}`,
      title: info.label,
      subtitle: info.hint,
      accelerator: info.prefix,
      kind: "mode",
      refine: info.prefix,
      run: noop,
    }));
  const help = commands.filter((command) => command.group === HELP_GROUP && command.id !== SHOW_ALL_COMMANDS);
  return [...modes, ...matchCommands(term, help)];
}

/** The assistant entry points '/' hands to, injected so the rows stay pure. */
export interface AskActions {
  open: () => void;
  ask: (text: string) => void;
}

/** '/': no term opens the assistant; a term is handed to its composer, never sent. */
export function askRows(term: string, actions: AskActions): PaletteResult[] {
  const text = term.trim();
  if (!text) return [{ id: "ask:open", title: "Open Binocle", subtitle: "Or type a question first", kind: "command", run: actions.open }];
  return [{
    id: "ask:handoff",
    title: `Ask Binocle: “${text}”`,
    subtitle: "Opens the assistant with this text; you press Send",
    kind: "command",
    run: () => actions.ask(text),
  }];
}
