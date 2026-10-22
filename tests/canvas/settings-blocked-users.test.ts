/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-blocked-users.test.ts                      :+:      :+:    :+:   */
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

import { findSection, searchSettings } from "@/features/settings/model/sections";

test("the registry has a moderation section with the blocked-users anchor", () => {
  const section = findSection("moderation");
  assert.ok(section, "moderation section missing");
  const anchor = section!.anchors.find((a) => a.id === "blocked-users");
  assert.ok(anchor, "blocked-users anchor missing");
});

test("searchSettings('block') finds the moderation section's blocked-users anchor", () => {
  const hits = searchSettings("block");
  assert.ok(hits.some((hit) => hit.section.id === "moderation" && hit.anchor.id === "blocked-users"),
    "search did not find blocked-users");
});

test("the panel's Section title slugs to the registry anchor id", () => {
  const source = readFileSync("src/features/settings/moderation/ModerationPanel.tsx", "utf8");
  const title = /<Section title="([^"]+)"/.exec(source)?.[1] ?? "";
  assert.equal(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "blocked-users");
});
