/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profession-templates.test.ts                       ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PROFESSIONS, isProfessionId, type ProfessionId } from "@/data/professions/professions";
import { professionProfileContent } from "@/data/professions/professionProfiles";
import { createProfessionHomeContent } from "@/widgets/database-view/model/professionHomeContent";
import { KNOWN_DATABASE_VIEWS } from "@/widgets/database-view/model/databaseViewCatalog.meta";
import { SEED_PAGES } from "@/data/seedPages";
import type { Block } from "@/entities/block";

// The eight professions of the plan, in the plan's order.
const IDS = [
  "student",
  "developer",
  "designer",
  "data-analyst",
  "researcher",
  "creator",
  "founder",
  "teacher",
] as const;

// The public projection toBoundRecord builds (src/widgets/profile-page/model/binding.tsx:18-35).
// A bound block may read one of these fields, or a key inside customFields — nothing else, so a
// template can never bind a private column.
const PROJECTION_FIELDS = new Set([
  "id",
  "displayName",
  "name",
  "username",
  "avatar",
  "role",
  "headline",
  "bio",
  "location",
  "joinedAt",
  "online",
  "lastSeenAt",
  "customFields",
]);

function isPublicField(field: string): boolean {
  if (field.startsWith("custom:")) return field.length > "custom:".length;
  return PROJECTION_FIELDS.has(field);
}

function boundFields(blocks: Block[]): string[] {
  return blocks
    .filter((block) => block.recordRef === "$record" && typeof block.fieldBind === "string")
    .map((block) => String(block.fieldBind));
}

function idsOf(blocks: Block[]): string[] {
  return blocks.map((block) => block.id);
}

test("the catalogue holds the eight professions in the plan's order", () => {
  assert.deepEqual(PROFESSIONS.map((profession) => profession.id), [...IDS]);
  for (const profession of PROFESSIONS) {
    assert.ok(profession.label.trim().length > 0, `${profession.id} has no label`);
    assert.ok(profession.icon.trim().length > 0, `${profession.id} has no icon`);
    assert.ok(profession.desc.trim().length > 0, `${profession.id} has no description`);
  }
});

test("isProfessionId accepts the eight ids and nothing else", () => {
  for (const id of IDS) assert.equal(isProfessionId(id), true, `${id} is refused`);
  const hostile: unknown[] = ["", "wizard", "Student", " student", "student ", "data analyst", null, 3, 0, undefined, {}, [], true];
  for (const value of hostile) assert.equal(isProfessionId(value), false, `${String(value)} is accepted`);
});

test("every profession profile binds the public record only", () => {
  for (const id of IDS) {
    const blocks = professionProfileContent(id);
    assert.ok(blocks.length > 0, `${id} profile is empty`);
    const fields = boundFields(blocks);
    assert.ok(fields.length > 0, `${id} profile binds nothing`);
    for (const field of fields) {
      assert.ok(isPublicField(field), `${id} binds the private field "${field}"`);
    }
  }
});

test("every profession profile has unique, stable, profession-scoped ids", () => {
  for (const id of IDS) {
    const ids = idsOf(professionProfileContent(id));
    assert.equal(new Set(ids).size, ids.length, `${id} profile repeats a block id`);
    for (const blockId of ids) {
      assert.ok(blockId.startsWith(`profession-${id}-`), `${id} profile holds the foreign id "${blockId}"`);
    }
    assert.deepEqual(idsOf(professionProfileContent(id)), ids, `${id} profile ids are not stable`);
  }
});

test("an unknown profession id builds nothing", () => {
  assert.deepEqual(professionProfileContent("wizard" as ProfessionId), []);
  assert.deepEqual(createProfessionHomeContent("wizard" as ProfessionId, { idScope: "ws-1" }), []);
});

test("every profession home is a titled stack over registered views", () => {
  for (const id of IDS) {
    const blocks = createProfessionHomeContent(id, { idScope: "home-dashboard:ws-1" });
    assert.ok(blocks.length > 0, `${id} home is empty`);
    assert.equal(blocks[0].type, "heading_1", `${id} home does not open on a greeting`);
    const titles = blocks.filter((block) => block.type === "heading_2");
    assert.ok(titles.length >= 3 && titles.length <= 4, `${id} home has ${titles.length} titled sections`);
    for (const block of blocks) {
      if (block.type === "home_views") continue;
      if (block.type !== "database_inline") continue;
      const known = KNOWN_DATABASE_VIEWS.find((view) => view.id === block.viewId);
      assert.ok(known, `${id} home points at the unknown view "${block.viewId}"`);
      assert.equal(known?.databaseId, block.databaseId, `${id} home pairs "${block.viewId}" with the wrong database`);
    }
    // Every section body is a database embed or the view launcher, never a stray block.
    const bodies = blocks.filter((block) => block.type === "database_inline" || block.type === "home_views");
    assert.equal(bodies.length, titles.length, `${id} home has a section without a body`);
  }
});

test("profession home ids are stable per scope and differ between scopes", () => {
  for (const id of IDS) {
    const first = idsOf(createProfessionHomeContent(id, { idScope: "ws-a" }));
    const second = idsOf(createProfessionHomeContent(id, { idScope: "ws-a" }));
    const other = idsOf(createProfessionHomeContent(id, { idScope: "ws-b" }));
    assert.deepEqual(second, first, `${id} home ids are not stable`);
    assert.notDeepEqual(other, first, `${id} home ids ignore the scope`);
  }
});

test("no seed page is a profession page", () => {
  for (const page of SEED_PAGES) {
    assert.ok(!page._id.startsWith("profession-"), `the seed page "${page._id}" claims a profession id`);
  }
});
