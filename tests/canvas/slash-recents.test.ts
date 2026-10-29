/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slash-recents.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Suggested section's recents list and the shortcut hints the catalog
// carries. The hints are the markdown prefixes the editor's detector knows.

import assert from "node:assert/strict";
import test from "node:test";

import { pushRecent } from "@/features/slash-commands/model/slashRecents";
import { SLASH_COMMANDS } from "@/features/slash-commands/model/slashMenuCatalog";

const shortcutFor = (label: string) =>
  SLASH_COMMANDS.find((command) => command.label === label)?.shortcut;

test("pushRecent puts the newest first, dedupes and caps at four", () => {
  assert.deepEqual(pushRecent([], "a"), ["a"]);
  assert.deepEqual(pushRecent(["b", "a"], "a"), ["a", "b"]);
  assert.deepEqual(pushRecent(["a", "b", "c", "d"], "e"), ["e", "a", "b", "c"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(pushRecent(["a", "b"], "c", 1), ["c"]);
});

test("the catalog carries exactly the markdown shortcut hints", () => {
  assert.equal(shortcutFor("Heading 1"), "#");
  assert.equal(shortcutFor("Toggle list"), ">");
  assert.equal(shortcutFor("Quote"), "\"");
  assert.equal(shortcutFor("Text"), undefined);
});
