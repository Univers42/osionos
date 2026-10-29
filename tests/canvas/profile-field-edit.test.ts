/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profile-field-edit.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { README_FIELDS } from "@/entities/block/model/binding";
import { bindBlock, clipPreview, isBindableType, previewFor, restyleBlock, styleOf, unbindBlock } from "@/features/profile-binding/model/bindingEdit";
import { bound } from "@/data/templates/templateBlocks";
import type { AccountProfile } from "@/shared/api/accountProfileApi";

const block = { id: "b1" };
const profile = (extra: Partial<AccountProfile> = {}): AccountProfile => ({
  userId: "u1", displayName: "Ada", username: "ada", pronouns: null, headline: "Maths", bio: null, location: null,
  company: null, website: null, links: ["https://a.example", "https://b.example"], timezone: null, orcid: null,
  patreon: null, avatarUrl: null, bannerUrl: null, directoryOptOut: true, profession: "student", readmePageId: "p",
  version: 3, createdAt: null, updatedAt: null, ...extra,
});

test("bindBlock to each style writes the shape bound() writes", () => {
  for (const style of ["text", 1, 2, 3] as const) {
    const patch = bindBlock(block, "headline", style);
    const expected = bound("b1", "headline", style === "text" ? undefined : style);
    assert.equal(patch?.type, expected.type);
    assert.equal(patch?.headingLevel, expected.headingLevel);
    assert.equal(patch?.recordRef, "$record");
    assert.equal(patch?.fieldBind, "headline");
    assert.equal(patch?.content, "");
  }
});

test("bindBlock accepts every README field and refuses anything else", () => {
  for (const { key } of README_FIELDS) assert.ok(bindBlock(block, key));
  for (const bad of ["custom:x", "email", "role", "constructor", "__proto__", "", " headline", "directoryOptOut"]) {
    assert.equal(bindBlock(block, bad), null, bad);
  }
});

test("unbindBlock leaves an empty paragraph with the three keys cleared", () => {
  const patch = unbindBlock();
  assert.equal(patch.type, "paragraph");
  assert.equal(patch.content, "");
  for (const key of ["recordRef", "fieldBind", "headingLevel"] as const) {
    assert.ok(key in patch && patch[key] === undefined, key);
  }
  const merged = { ...bound("b1", "bio", 2), ...patch };
  assert.equal(JSON.stringify(merged), JSON.stringify({ id: "b1", type: "paragraph", content: "" }));
});

test("styleOf reads the heading level from the type", () => {
  assert.equal(styleOf({ type: "paragraph" }), "text");
  assert.equal(styleOf({ type: "heading_1" }), 1);
  assert.equal(styleOf({ type: "heading_3" }), 3);
});

test("only paragraphs and headings can be bound", () => {
  assert.ok(isBindableType({ type: "heading_2" }));
  assert.equal(isBindableType({ type: "code" }), false);
});

test("previewFor shows the value, joins links, labels the profession and hides what is empty", () => {
  assert.equal(previewFor(profile(), "headline"), "Maths");
  assert.equal(previewFor(profile(), "links"), "https://a.example, https://b.example");
  assert.equal(previewFor(profile(), "profession"), "Student");
  assert.equal(previewFor(profile({ profession: "no-such-id" }), "profession"), "no-such-id");
  assert.equal(previewFor(profile(), "bio"), null);
  assert.equal(previewFor(null, "headline"), null);
  assert.equal(previewFor(profile(), "constructor"), null);
});

test("an unlisted stored key is not a README field, so the inspector shows Unknown field", () => {
  assert.equal(README_FIELDS.some((field) => field.key === "email"), false);
  assert.equal(bindBlock(block, "email"), null);
});

test("clipPreview keeps 120 characters and an ellipsis", () => {
  assert.equal(clipPreview("x".repeat(120)).length, 120);
  assert.equal(clipPreview("x".repeat(121)), `${"x".repeat(120)}…`);
});

test("restyleBlock changes only the type and level", () => {
  assert.deepEqual(restyleBlock("text"), { type: "paragraph", headingLevel: undefined });
  assert.deepEqual(restyleBlock(2), { type: "heading_2", headingLevel: 2 });
});
