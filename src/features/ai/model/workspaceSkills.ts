/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceSkills.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The form of a workspace skill: the caps the service enforces, checked
 * before the request so a person sees the words and not a 400.
 *
 * Caveat: the caps are copied from the service (the database owns them); if
 * they move there and not here, the service still refuses and the panel shows
 * its generic failure line.
 */

import { AiError } from "@/features/ai/api/aiContract";

export const SKILL_BODY_MAX = 6000;
export const SKILL_NAME_MAX = 80;
export const SKILL_DESCRIPTION_MAX = 160;
export const SKILL_SLUG = /^[a-z][a-z0-9-]{1,31}$/;

export interface SkillDraft {
  slug: string;
  name: string;
  description: string;
  body: string;
}

/** What is wrong with a draft, in a sentence; null when it can be sent. */
export function skillDraftProblem(draft: SkillDraft, isNew: boolean): string | null {
  if (isNew && !SKILL_SLUG.test(draft.slug)) return "The id is 2 to 32 characters: lowercase letters, digits, dashes.";
  const name = draft.name.trim();
  if (name.length === 0 || name.length > SKILL_NAME_MAX) return `The name is 1 to ${SKILL_NAME_MAX} characters.`;
  const description = draft.description.trim();
  if (description.length === 0 || description.length > SKILL_DESCRIPTION_MAX) {
    return `The description is 1 to ${SKILL_DESCRIPTION_MAX} characters.`;
  }
  if (/[\r\n]/.test(description)) return "The description is one line.";
  if (draft.body.length === 0 || draft.body.length > SKILL_BODY_MAX) {
    return `The text is 1 to ${SKILL_BODY_MAX} characters.`;
  }
  return null;
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

/** One top-level `key: value` line of front matter, without its quotes. */
function frontMatterValue(front: string, key: string): string {
  const line = front.split("\n").find((entry) => entry.startsWith(`${key}:`));
  const value = line ? line.slice(key.length + 1).trim() : "";
  // A block scalar's marker (`>`, `|-`, ...) is not the value: its lines are not read.
  if (/^[>|][-+]?$/.test(value)) return "";
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * A draft from a skill file in opencode's format (`SKILL.md`: front matter with
 * `name` and `description`, then the instructions). It only fills the form: the
 * person reads it and saves it like a typed skill, through the same checks.
 *
 * Caveat: the front matter is read line by line, not as YAML. A folded or block
 * value (`description: >` then indented lines) comes back empty, so the form says
 * the field is missing and the person types it before saving.
 */
export function skillDraftFromMarkdown(text: string): SkillDraft {
  const normalized = text.replace(/\r\n?/g, "\n");
  const match = FRONT_MATTER.exec(normalized);
  const front = match ? match[1] : "";
  const name = frontMatterValue(front, "name");
  return {
    slug: name,
    name,
    description: frontMatterValue(front, "description"),
    body: (match ? normalized.slice(match[0].length) : normalized).trim(),
  };
}

/** The characters left in the body; negative when over the cap. */
export const bodyCharsLeft = (body: string): number => SKILL_BODY_MAX - body.length;

/** The refusals of the service, in plain words. */
export function skillFailureMessage(error: unknown): string {
  if (error instanceof AiError) {
    if (error.status === 403) return "Only workspace owners and admins can change skills.";
    if (error.status === 404) return "This workspace's skills are not available to you.";
    if (error.code === "skill_limit") return "A workspace holds at most 8 skills. Archive one first.";
    if (error.code === "skill_exists") return "A skill with this id already exists.";
    if (error.code === "skill_builtin") return "This id belongs to a built-in skill.";
  }
  return "The skill could not be saved. Try again.";
}
