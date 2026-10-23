/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-interaction-limits.test.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as bridge from "../../scripts/bridge-moderation-core.mjs";
import { findSection, searchSettings } from "@/features/settings/model/sections";
import {
  DURATION_HOURS,
  INTERACTIONS,
  MODES,
  auditMetadata,
  durationLabel,
  expiryLabel,
  modeLabel,
  parseModeration,
} from "@/features/settings/moderation/moderationModel";

const NOW = Date.parse("2026-10-22T12:00:00.000Z");
const FUTURE = "2026-10-23T12:00:00.000Z";
const DEFAULTS = {
  messages: { mode: "everyone" },
  connections: { mode: "everyone" },
  comments: { mode: "everyone" },
};
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the registry's moderation section has both anchors and search finds the limits one", () => {
  const ids = findSection("moderation")!.anchors.map((anchor) => anchor.id);
  assert.deepEqual(ids, ["blocked-users", "interaction-limits"]);
  const hits = searchSettings("who can message");
  assert.ok(hits.some((hit) => hit.section.id === "moderation" && hit.anchor.id === "interaction-limits"));
});

test("the panel's Section title slugs to the interaction-limits anchor", () => {
  const source = read("src/features/settings/moderation/ModerationPanel.tsx");
  assert.match(source, /<Section title="Interaction limits">/);
});

test("the vocabulary copy equals the bridge's", () => {
  assert.deepEqual([...INTERACTIONS], bridge.INTERACTIONS);
  assert.deepEqual(MODES, bridge.MODES);
  assert.deepEqual([...DURATION_HOURS], bridge.DURATION_HOURS);
});

test("modeLabel and durationLabel word every value", () => {
  assert.equal(modeLabel("messages", "everyone"), "Everyone");
  assert.equal(modeLabel("messages", "connections"), "People you are connected to");
  assert.equal(modeLabel("comments", "workspace"), "People in the workspace");
  assert.equal(modeLabel("connections", "nobody"), "Nobody");
  assert.deepEqual(DURATION_HOURS.map(durationLabel), ["24 hours", "7 days", "30 days", "90 days", "6 months"]);
});

test("expiryLabel: a future until reads Until, anything else No limit", () => {
  assert.equal(expiryLabel(FUTURE, NOW), "Until 23 Oct 2026");
  assert.equal(expiryLabel(undefined, NOW), "No limit");
  assert.equal(expiryLabel("not a date", NOW), "No limit");
  assert.equal(expiryLabel("2026-10-01T00:00:00.000Z", NOW), "No limit");
});

test("parseModeration reads a live limit and defaults everything it cannot prove", () => {
  assert.deepEqual(parseModeration({ messages: { mode: "connections", until: FUTURE } }, NOW), {
    ...DEFAULTS,
    messages: { mode: "connections", until: FUTURE },
  });
  for (const body of [null, "x", 7, [], undefined]) assert.deepEqual(parseModeration(body, NOW), DEFAULTS);
  assert.deepEqual(parseModeration({ likes: { mode: "nobody", until: FUTURE } }, NOW), DEFAULTS);
  assert.deepEqual(parseModeration({ messages: { mode: "workspace", until: FUTURE } }, NOW), DEFAULTS);
  assert.deepEqual(parseModeration({ messages: { mode: "nobody", until: "soon" } }, NOW), DEFAULTS);
  assert.deepEqual(parseModeration({ messages: { mode: "nobody", until: "2026-10-01T00:00:00.000Z" } }, NOW), DEFAULTS);
  assert.deepEqual(parseModeration({ messages: "nobody" }, NOW), DEFAULTS);
});

test("the client sends the page JWT and the {interaction: {mode, durationHours}} body", () => {
  const source = read("src/features/settings/moderation/moderationApi.ts");
  assert.match(source, /api\.get<[^>]*>\(\s*ROUTE\s*,\s*getActivePageJwt\(\)/);
  assert.match(source, /api\.patch<[^>]*>\(\s*ROUTE\s*,\s*\{ \[interaction\]: request \}\s*,\s*getActivePageJwt\(\)/);
  assert.match(source, /error\.status === 404/);
  assert.doesNotMatch(source, /getActiveJwt\(/);
});

test("the audit metadata carries the interaction and the mode, never the until", () => {
  assert.deepEqual(auditMetadata("messages", "nobody"), { interaction: "messages", mode: "nobody" });
  const panel = read("src/features/settings/moderation/ModerationPanel.tsx");
  assert.match(panel, /recordSettingsAction\('moderation_limit_update', auditMetadata\(/);
});

test("the blocked-users copy and the comment scope stay in the panel", () => {
  const blocked = read("src/features/settings/moderation/BlockedUsersPanel.tsx");
  assert.ok(blocked.includes("Blocking someone hides them from your directory and your connections, and stops their messages. They are not told."));
  assert.ok(read("src/features/settings/moderation/ModerationPanel.tsx").includes("A block does not stop a comment."));
});
