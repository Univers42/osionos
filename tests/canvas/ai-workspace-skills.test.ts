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
  skillDraftFromMarkdown,
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

// An opencode skill file (opencode.ai/docs/skills): YAML front matter, then the instructions (#78).
const OPENCODE_SKILL = [
  "---",
  "name: git-release",
  'description: "Create consistent releases and changelogs"',
  "license: MIT",
  "compatibility: opencode",
  "metadata:",
  "  audience: maintainers",
  "---",
  "",
  "## What I do",
  "- Draft release notes from merged PRs",
  "",
].join("\r\n");

test("an opencode SKILL.md fills id, name, description and text, and the draft can be sent", () => {
  const imported = skillDraftFromMarkdown(OPENCODE_SKILL);
  assert.deepEqual(imported, {
    slug: "git-release",
    name: "git-release",
    description: "Create consistent releases and changelogs",
    body: "## What I do\n- Draft release notes from merged PRs",
  });
  assert.equal(skillDraftProblem(imported, true), null);
});

test("a file without front matter becomes the text alone, and the form names what is missing", () => {
  const imported = skillDraftFromMarkdown("Step 1.\nStep 2.\n");
  assert.deepEqual(imported, { slug: "", name: "", description: "", body: "Step 1.\nStep 2." });
  assert.match(skillDraftProblem(imported, true) ?? "", /id/);
});

test("a front matter key is read only at its own line start, never from the instructions", () => {
  const imported = skillDraftFromMarkdown("---\nname: a-b\n---\ndescription: not this\n");
  assert.equal(imported.description, "");
  assert.equal(imported.body, "description: not this");
});

test("a folded description is left empty for the person to type, never saved as '>'", () => {
  const imported = skillDraftFromMarkdown("---\nname: a-b\ndescription: >\n  Folded text\n---\nBody\n");
  assert.equal(imported.description, "");
  assert.match(skillDraftProblem(imported, true) ?? "", /description/);
});
