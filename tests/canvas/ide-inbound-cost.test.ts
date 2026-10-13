/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-cost.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One event's lookups on a 10 000-page workspace: the inbound path walks the
// facade's per-directory tables a segment at a time, never scans the tree.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash } from "../../src/features/ide/model/ideSyncEngine.ts";
import { executeSteps } from "../../src/features/ide/model/inboundExec.ts";
import { planInbound } from "../../src/features/ide/model/inboundPlan.ts";
import { createInboundView } from "../../src/features/ide/model/inboundView.ts";
import { createLandedMemo } from "../../src/features/ide/model/inboundLanded.ts";
import { createPageFileFacade } from "../../src/features/page-file/model/pageFileFacade.ts";
import { blockPage, folderPage, viewWorld } from "./fixtures/inboundWorld.ts";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import type { ReadableViews } from "../../src/features/page-file/model/pageFileFacadeViews.ts";
import type { PageDir, Tables } from "../../src/features/page-file/model/pageFileFacadeTables.ts";

/** 100 folders × 99 pages, plus Area/Team/Roadmap.omd three levels down. */
function tenThousandPages(): PageEntry[] {
  const pages: PageEntry[] = [folderPage("A", "Area"), folderPage("T", "Team", "A"), blockPage("R", "Roadmap", "T")];
  for (let folder = 0; folder < 100; folder += 1) {
    pages.push(folderPage(`F${folder}`, `Folder ${folder}`));
    for (let child = 0; child < 99; child += 1) pages.push(blockPage(`P${folder}-${child}`, `Page ${child}`, `F${folder}`));
  }
  return pages;
}

/** The same views, every per-directory name lookup counted. */
function countingViews(views: ReadableViews, counter: { lookups: number }): ReadableViews {
  let source: Tables | undefined;
  let counted: Tables | undefined;
  const wrap = (tables: Tables): Tables => {
    const dirs = new Map<string, PageDir>();
    for (const [key, dir] of tables.dirs) {
      const byName = new Map(dir.byName);
      const get = byName.get.bind(byName);
      byName.get = (name) => { counter.lookups += 1; return get(name); };
      dirs.set(key, { ...dir, byName });
    }
    return { ...tables, dirs };
  };
  const tablesFor = (): Tables => {
    const tables = views.tablesFor();
    if (tables !== source) { source = tables; counted = wrap(tables); }
    return counted ?? wrap(tables);
  };
  return { ...views, tablesFor };
}

test("cost: a shell edit three levels deep in a 10 000-page workspace makes at most depth+1 name lookups", async () => {
  const world = viewWorld(tenThousandPages());
  const counter = { lookups: 0 };
  const views = countingViews(world.views, counter);
  const facade = createPageFileFacade(world.store, views);
  const readText = (id: string): Promise<string> => facade.readContent(id);
  const landed = createLandedMemo({ workspaceId: world.workspaceId, readText });
  const view = createInboundView({ workspaceId: world.workspaceId, store: world.store, views, pending: world.pending, landed, readText });
  const ours = await facade.readContent("R");
  recordSyncedHash(world.workspaceId, "Area/Team/Roadmap.omd", await sha16(ours));
  const text = `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}Edited in vim\n`;
  views.tablesFor();
  counter.lookups = 0;

  const event = { kind: "write" as const, path: "Area/Team/Roadmap.omd", text, hash: await sha16(text) };
  const steps = await planInbound(event, view);
  const ctx = { workspaceId: world.workspaceId, facade, view, pending: world.pending, landed, settle: async () => undefined, restore: async () => undefined, stat: async () => "unknown" as const };
  const outcome = await executeSteps(steps, event.path, ctx);

  assert.deepEqual(steps.map((step) => step.op), ["apply"]);
  assert.equal(outcome.applied, true);
  assert.ok(counter.lookups <= 3 + 1, `expected at most 4 name lookups, saw ${counter.lookups}`);
});
