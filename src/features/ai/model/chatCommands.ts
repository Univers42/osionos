/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chatCommands.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The "/" palette of the assistant composer: what can be typed after a slash.
 *
 * Two kinds of command share one list. An action changes the composer or the
 * chat (a new conversation, the model picker). A prompt is a template the
 * service owns; picking it leaves "/name " in the text and the reader types
 * the arguments. Pure: the composer owns the DOM, this owns the rules.
 */

import type { AiCommand } from "../api/aiContract";

export interface ChatCommand {
  name: string;
  description: string;
  kind: "action" | "prompt";
  template?: string;
  keywords?: string[];
}

/** Only actions the composer can perform today; a placeholder would be a lie. */
export const CHAT_ACTIONS: readonly ChatCommand[] = [
  { name: "new", description: "Start a new conversation", kind: "action", keywords: ["clear", "reset"] },
  { name: "model", description: "Choose the model", kind: "action", keywords: ["connection", "provider"] },
  { name: "agent", description: "Choose the agent", kind: "action" },
  { name: "context", description: "Add pages the answer may read", kind: "action", keywords: ["pages", "mention"] },
  { name: "attach", description: "Attach an image", kind: "action", keywords: ["picture", "vision"] },
  { name: "help", description: "List the commands", kind: "action", keywords: ["commands"] },
];

const MAX_RESULTS = 12;

/** The actions first, then the service's chat commands; an action wins a name clash. */
export function mergeCommands(actions: readonly ChatCommand[], serviceCommands: readonly AiCommand[]): ChatCommand[] {
  const seen = new Set(actions.map((action) => action.name));
  const merged = [...actions];
  for (const command of serviceCommands) {
    if (command.surface === "editor" || seen.has(command.name)) continue;
    seen.add(command.name);
    merged.push({ name: command.name, description: command.description, kind: "prompt", template: command.template });
  }
  return merged;
}

/**
 * The query when the text before the caret is exactly "/<word>" at the start
 * of the input, else null. A "/" inside a sentence, a URL or a path never
 * opens the palette, and it closes once the arguments start (a space).
 */
export function slashQuery(value: string, caret: number): string | null {
  const match = /^\/([A-Za-z0-9-]*)$/.exec(value.slice(0, caret));
  return match ? match[1] : null;
}

/** Prefix on the name, then substring on the name, then description or keywords. */
export function filterCommands(commands: readonly ChatCommand[], query: string): ChatCommand[] {
  const needle = query.toLowerCase();
  if (!needle) return commands.slice(0, MAX_RESULTS);
  const prefix: ChatCommand[] = [];
  const inName: ChatCommand[] = [];
  const inText: ChatCommand[] = [];
  for (const command of commands) {
    const name = command.name.toLowerCase();
    if (name.startsWith(needle)) prefix.push(command);
    else if (name.includes(needle)) inName.push(command);
    else if (
      command.description.toLowerCase().includes(needle) ||
      (command.keywords ?? []).some((word) => word.toLowerCase().includes(needle))
    ) inText.push(command);
  }
  return [...prefix, ...inName, ...inText].slice(0, MAX_RESULTS);
}

/** Fills `$ARGUMENTS`; a template without it gets the arguments after a blank line. */
export function expandPrompt(template: string, args: string): string {
  const rest = args.trim();
  if (!template.includes("$ARGUMENTS")) return rest ? `${template}\n\n${rest}` : template;
  if (!rest) return template.split("$ARGUMENTS").join("").replace(/[ \t]+/g, " ").replace(/ +([.,:;!?])/g, "$1").trim();
  return template.split("$ARGUMENTS").join(rest);
}

export interface PaletteState {
  open: boolean;
  index: number;
  count: number;
}

export interface PaletteStep {
  open: boolean;
  index: number;
  /** The index to pick, when the key was Enter or Tab on a non-empty list. */
  pick?: number;
  /** False when the palette ignores the key and the textarea keeps it. */
  handled: boolean;
}

/** The keyboard of the open palette: arrows wrap, Enter and Tab pick, Escape closes. */
export function paletteKey(state: PaletteState, key: string): PaletteStep {
  if (!state.open) return { open: false, index: state.index, handled: false };
  const { count, index } = state;
  switch (key) {
    case "ArrowDown":
      return { open: true, index: count ? (index + 1) % count : 0, handled: true };
    case "ArrowUp":
      return { open: true, index: count ? (index - 1 + count) % count : 0, handled: true };
    case "Enter":
    case "Tab":
      // An empty list has nothing to pick, and Enter must not submit "/zzz".
      return count ? { open: false, index, pick: index, handled: true } : { open: true, index, handled: true };
    case "Escape":
      return { open: false, index, handled: true };
    default:
      return { open: true, index, handled: false };
  }
}

/**
 * The text a submit sends: "/name args" of a known prompt command becomes its
 * expanded template; anything else (an action, an unknown "/word", plain
 * text) is null and goes out as typed.
 */
export function expandSlashText(text: string, commands: readonly ChatCommand[]): string | null {
  const match = /^\/([A-Za-z0-9-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  const command = commands.find((candidate) => candidate.kind === "prompt" && candidate.name === match[1]);
  return command?.template === undefined ? null : expandPrompt(command.template, match[2] ?? "");
}
