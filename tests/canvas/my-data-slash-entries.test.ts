/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   my-data-slash-entries.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { RECENTS_DB_ID, RECENTS_GALLERY_VIEW, TEMPLATES_DB_ID, TEMPLATES_GALLERY_VIEW } from "../../src/widgets/database-view/model/workspaceDatabaseConstants.ts";
import { SYS_SOURCES } from "../../src/widgets/database-view/model/sysDataSources.ts";
import { buildSysSlashCommands } from "../../src/features/slash-commands/model/sysSlashCommands.ts";

// Counted from SYS_SOURCES: a new sys: source (sys:my-followers, #49) must not break the pin.
test("the my-data section holds Recently visited and Templates after every sys: entry", () => {
  const commands = buildSysSlashCommands();
  const sysCount = SYS_SOURCES.length;
  assert.deepEqual(commands.slice(0, sysCount).map((c) => c.label), SYS_SOURCES.map((s) => s.label));
  assert.equal(commands.length, sysCount + 2);
  const recent = commands[sysCount];
  const templates = commands[sysCount + 1];
  assert.equal(recent.label, "Recently visited");
  assert.equal(recent.databaseId, RECENTS_DB_ID);
  assert.equal(recent.viewId, RECENTS_GALLERY_VIEW);
  assert.equal(templates.label, "Templates");
  assert.equal(templates.databaseId, TEMPLATES_DB_ID);
  assert.equal(templates.viewId, TEMPLATES_GALLERY_VIEW);
});
