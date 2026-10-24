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
