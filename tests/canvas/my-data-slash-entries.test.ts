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
import { buildSysSlashCommands } from "../../src/features/slash-commands/model/sysSlashCommands.ts";

test("the my-data section holds Recently visited and Templates after the seven sys: entries", () => {
  const commands = buildSysSlashCommands();
  assert.equal(commands.length, 9);
  const recent = commands[7];
  const templates = commands[8];
  assert.equal(recent.label, "Recently visited");
  assert.equal(recent.databaseId, RECENTS_DB_ID);
  assert.equal(recent.viewId, RECENTS_GALLERY_VIEW);
  assert.equal(templates.label, "Templates");
  assert.equal(templates.databaseId, TEMPLATES_DB_ID);
  assert.equal(templates.viewId, TEMPLATES_GALLERY_VIEW);
});
