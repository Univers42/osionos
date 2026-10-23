/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-workspace-skills.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The form of a workspace skill: its caps and the words of a refusal.
 * Pure logic only.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { AiError } from "@/features/ai/api/aiContract";
import {
  bodyCharsLeft,
  skillDraftProblem,
  skillFailureMessage,
  SKILL_BODY_MAX,
  type SkillDraft,
} from "@/features/ai/model/workspaceSkills";

const draft = (over: Partial<SkillDraft> = {}): SkillDraft => ({
  slug: "release-notes",
  name: "Release notes",
  description: "How we write release notes",
  body: "Step 1.",
  ...over,
});

test("a good draft can be sent", () => {
  assert.equal(skillDraftProblem(draft(), true), null);
});

test("each cap is a sentence", () => {
  assert.match(skillDraftProblem(draft({ slug: "Bad Slug" }), true) ?? "", /id/);
  assert.equal(skillDraftProblem(draft({ slug: "Bad Slug" }), false), null, "the id is fixed once written");
  assert.match(skillDraftProblem(draft({ name: " " }), true) ?? "", /name/);
  assert.match(skillDraftProblem(draft({ description: "a\nb" }), true) ?? "", /one line/);
  assert.match(skillDraftProblem(draft({ description: "x".repeat(161) }), true) ?? "", /description/);
  assert.match(skillDraftProblem(draft({ body: "x".repeat(SKILL_BODY_MAX + 1) }), true) ?? "", /text/);
  assert.equal(skillDraftProblem(draft({ body: "x".repeat(SKILL_BODY_MAX) }), true), null);
});

test("the counter goes negative over the cap", () => {
  assert.equal(bodyCharsLeft("abc"), SKILL_BODY_MAX - 3);
  assert.ok(bodyCharsLeft("x".repeat(SKILL_BODY_MAX + 2)) < 0);
});

test("refusals are plain words, never a code", () => {
  assert.match(skillFailureMessage(new AiError(403, "forbidden")), /owners and admins/);
  assert.match(skillFailureMessage(new AiError(409, "skill_limit")), /at most 8/);
  assert.match(skillFailureMessage(new AiError(409, "skill_exists")), /already exists/);
  assert.match(skillFailureMessage(new Error("boom")), /could not be saved/);
});
