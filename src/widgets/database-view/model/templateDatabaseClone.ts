/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateDatabaseClone.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure cloning of the databases a template embeds, so a page made from a
// template owns its own copy (schema, views, rows) instead of sharing the demo
// seed. No store, React or seed imports: the inputs are deep-frozen by callers.

import type { Block } from "@/entities/block";
import type { NotionState } from "@notion-db/object-database";

interface CreatedEntry {
  id: string;
  viewId: string;
  name: string;
}

export function cloneTemplateDatabases(
  content: Block[],
  state: NotionState,
  mintId: (prefix: string) => string,
): { content: Block[]; state: NotionState; created: CreatedEntry[] } {
  // Collect the databases actually embedded in this content, in first-seen order.
  const toClone: string[] = [];
  const seen = new Set<string>();
  const collect = (blocks: Block[] | undefined): void => {
    if (!blocks) return;
    for (const block of blocks) {
      if (
        (block.type === "database_inline" || block.type === "database_full_page") &&
        typeof block.databaseId === "string"
      ) {
        const dbId = block.databaseId;
        if (Object.prototype.hasOwnProperty.call(state.databases, dbId) && !seen.has(dbId)) {
          seen.add(dbId);
          toClone.push(dbId);
        }
      }
      if (block.children) collect(block.children);
      if (block.layoutCells) {
        for (const cell of block.layoutCells) collect(cell.blocks);
      }
    }
  };
  collect(content);

  if (toClone.length === 0) {
    return { content, state, created: [] };
  }

  const clonedDbSet = new Set(toClone);

  const dbMap = new Map<string, string>();
  for (const oldId of toClone) dbMap.set(oldId, mintId("db"));

  // Map every view belonging to a cloned database, in viewOrder then creation order.
  const viewMap = new Map<string, string>();
  for (const oldDbId of toClone) {
    const db = state.databases[oldDbId];
    const viewIds: string[] = [];
    if (Array.isArray(db?.viewOrder)) {
      for (const vId of db.viewOrder) {
        if (state.views[vId] && state.views[vId].databaseId === oldDbId && !viewIds.includes(vId)) {
          viewIds.push(vId);
        }
      }
    }
    for (const [vId, view] of Object.entries(state.views)) {
      if (view.databaseId === oldDbId && !viewIds.includes(vId)) viewIds.push(vId);
    }
    for (const vId of viewIds) {
      if (!viewMap.has(vId)) viewMap.set(vId, mintId("v"));
    }
  }

  // Map every page (record, incl. templates) belonging to a cloned database.
  const pageMap = new Map<string, string>();
  for (const oldDbId of toClone) {
    const pageIds: string[] = [];
    for (const [pId, page] of Object.entries(state.pages)) {
      if (page.databaseId === oldDbId) pageIds.push(pId);
    }
    for (const pId of pageIds) {
      if (!pageMap.has(pId)) pageMap.set(pId, mintId("page"));
    }
  }

  const newDatabases: NotionState["databases"] = { ...state.databases };
  const newViews: NotionState["views"] = { ...state.views };
  const newPages: NotionState["pages"] = { ...state.pages };

  for (const oldDbId of toClone) {
    const oldDb = state.databases[oldDbId];
    const newDbId = dbMap.get(oldDbId)!;
    const newProps: Record<string, unknown> = {};
    for (const [propId, prop] of Object.entries(oldDb.properties ?? {})) {
      const clonedProp = structuredClone(prop) as {
        relationConfig?: { databaseId?: string };
      };
      const rc = clonedProp.relationConfig;
      if (rc && typeof rc.databaseId === "string" && clonedDbSet.has(rc.databaseId)) {
        clonedProp.relationConfig = { ...rc, databaseId: dbMap.get(rc.databaseId)! };
      }
      newProps[propId] = clonedProp;
    }
    const newViewOrder = Array.isArray(oldDb.viewOrder)
      ? oldDb.viewOrder.map((vId) => (viewMap.has(vId) ? viewMap.get(vId)! : vId))
      : oldDb.viewOrder;
    const newDefaultTemplateId =
      typeof oldDb.defaultTemplateId === "string" && pageMap.has(oldDb.defaultTemplateId)
        ? pageMap.get(oldDb.defaultTemplateId)!
        : oldDb.defaultTemplateId;
    newDatabases[newDbId] = {
      ...structuredClone(oldDb),
      id: newDbId,
      properties: newProps as NotionState["databases"][string]["properties"],
      viewOrder: newViewOrder,
      defaultTemplateId: newDefaultTemplateId,
    };
  }

  for (const [oldViewId, newViewId] of viewMap.entries()) {
    const oldView = state.views[oldViewId];
    const newDatabaseId = dbMap.has(oldView.databaseId) ? dbMap.get(oldView.databaseId)! : oldView.databaseId;
    const clonedView = structuredClone(oldView);
    clonedView.id = newViewId;
    clonedView.databaseId = newDatabaseId;
    const settings = clonedView.settings as { dashboardWidgets?: { viewId?: string }[] } | undefined;
    if (settings && Array.isArray(settings.dashboardWidgets)) {
      settings.dashboardWidgets = settings.dashboardWidgets.map((widget) => {
        if (widget && typeof widget.viewId === "string" && viewMap.has(widget.viewId)) {
          return { ...widget, viewId: viewMap.get(widget.viewId)! };
        }
        return widget;
      });
    }
    newViews[newViewId] = clonedView;
  }

  for (const [oldPageId, newPageId] of pageMap.entries()) {
    const oldPage = state.pages[oldPageId];
    const newDatabaseId = dbMap.has(oldPage.databaseId) ? dbMap.get(oldPage.databaseId)! : oldPage.databaseId;
    const clonedPage = structuredClone(oldPage);
    clonedPage.id = newPageId;
    clonedPage.databaseId = newDatabaseId;
    const props = (clonedPage.properties ?? {}) as Record<string, unknown>;
    const newProps: Record<string, unknown> = { ...props };
    for (const [propId, val] of Object.entries(props)) {
      if (Array.isArray(val)) {
        newProps[propId] = val.map((v) =>
          typeof v === "string" && pageMap.has(v) ? pageMap.get(v)! : v,
        );
      } else if (typeof val === "string" && pageMap.has(val)) {
        newProps[propId] = pageMap.get(val)!;
      }
    }
    clonedPage.properties = newProps as NotionState["pages"][string]["properties"];
    newPages[newPageId] = clonedPage;
  }

  const newContent = structuredClone(content) as Block[];
  const remapBlocks = (blocks: Block[] | undefined): void => {
    if (!blocks) return;
    for (const block of blocks) {
      if (block.type === "database_inline" || block.type === "database_full_page") {
        if (typeof block.databaseId === "string" && dbMap.has(block.databaseId)) {
          block.databaseId = dbMap.get(block.databaseId)!;
          if (typeof block.viewId === "string" && viewMap.has(block.viewId)) {
            block.viewId = viewMap.get(block.viewId)!;
          }
        }
      }
      if (block.children) remapBlocks(block.children);
      if (block.layoutCells) {
        for (const cell of block.layoutCells) remapBlocks(cell.blocks);
      }
    }
  };
  remapBlocks(newContent);

  const created: CreatedEntry[] = toClone.map((oldDbId) => {
    const newDbId = dbMap.get(oldDbId)!;
    const newDb = newDatabases[newDbId];
    let viewId = "";
    if (Array.isArray(newDb.viewOrder) && newDb.viewOrder.length > 0) {
      viewId = newDb.viewOrder[0];
    } else {
      for (const [vId, view] of Object.entries(newViews)) {
        if (view.databaseId === newDbId) {
          viewId = vId;
          break;
        }
      }
    }
    return { id: newDbId, viewId, name: newDb.name };
  });

  const nextState = { databases: newDatabases, pages: newPages, views: newViews } as NotionState;
  return { content: newContent, state: nextState, created };
}
