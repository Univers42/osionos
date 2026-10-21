/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiSlashCommands.ts                                 :+:      :+:    :+:   */
/*                                                    Reputation         */
/*   By: dlesieur <dlesieur@student.42.fr>          Reputation         */
/*                                                Reputation           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The AI group of the slash menu.
 *
 * One entry per editor command of the service (the wire contract's built-in
 * list). The icons are plain glyphs — no JSX — so this module loads under
 * `node --experimental-strip-types` and the list is unit-testable.
 *
 * The group shows ONLY when an AI base URL is configured: the menu passes
 * `isAiConfigured()` — the same rule the chat port uses to choose itself
 * (see `selectInferencePort`).
 */

import type { SlashAiCommand } from "./types";

/** The AI actions of the slash menu — one per editor command. */
export const AI_SLASH_COMMANDS: SlashAiCommand[] = [
  {
    id: "ai:ask",
    kind: "ai",
    section: "ai",
    label: "Ask AI",
    aliases: ["ai", "ask ai", "assistant"],
    icon: "✨",
    description: "Ask the assistant anything about this block",
    command: "ask",
  },
  {
    id: "ai:summarize",
    kind: "ai",
    section: "ai",
    label: "Summarize",
    aliases: ["summary", "tldr"],
    icon: "📝",
    description: "Summarize this block in a few sentences",
    command: "summarize",
  },
  {
    id: "ai:continue",
    kind: "ai",
    section: "ai",
    label: "Continue writing",
    aliases: ["continue", "keep writing"],
    icon: "⏭️",
    description: "Continue writing this block in the same voice",
    command: "continue",
  },
  {
    id: "ai:improve",
    kind: "ai",
    section: "ai",
    label: "Improve writing",
    aliases: ["improve", "rewrite"],
    icon: "🪄",
    description: "Rewrite this block more clearly, keeping the meaning",
    command: "improve",
  },
  {
    id: "ai:fix",
    kind: "ai",
    section: "ai",
    label: "Fix spelling & grammar",
    aliases: ["fix", "grammar", "spelling"],
    icon: "✔️",
    description: "Fix the spelling and the grammar of this block",
    command: "fix",
  },
  {
    id: "ai:shorter",
    kind: "ai",
    section: "ai",
    label: "Make shorter",
    aliases: ["shorter", "shorten", "condense"],
    icon: "✂️",
    description: "Make this block shorter",
    command: "shorter",
  },
  {
    id: "ai:longer",
    kind: "ai",
    section: "ai",
    label: "Make longer",
    aliases: ["longer", "lengthen", "expand"],
    icon: "📄",
    description: "Make this block longer",
    command: "longer",
  },
  {
    id: "ai:translate",
    kind: "ai",
    section: "ai",
    label: "Translate",
    aliases: ["translate", "language"],
    icon: "🌍",
    description: "Translate this block — name the language after the command",
    command: "translate",
  },
  {
    id: "ai:action-items",
    kind: "ai",
    section: "ai",
    label: "Action items",
    aliases: ["action items", "tasks", "todo", "checklist"],
    icon: "☑️",
    description: "Turn this block into a checklist of action items",
    command: "action-items",
  },
  {
    id: "ai:explain",
    kind: "ai",
    section: "ai",
    label: "Explain",
    aliases: ["explain", "what does this mean"],
    icon: "💡",
    description: "Explain this block simply",
    command: "explain",
  },
];

/**
 * The AI group — empty when the AI service is not configured.
 *
 * The flag is a parameter so the caller owns the check (the menu passes
 * `isAiConfigured()`) and so the rule is testable without a service.
 */
export function aiSlashCommands(enabled: boolean): SlashAiCommand[] {
  return enabled ? AI_SLASH_COMMANDS : [];
}
