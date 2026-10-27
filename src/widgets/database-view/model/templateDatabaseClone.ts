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

interface IdMaps {
  dbMap: Map<string, string>;
  viewMap: Map<string, string>;
  pageMap: Map<string, string>;
}

function collectEmbeddedDatabaseIds(content: Block[], state: NotionState): string[] {
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
  return toClone;
}

function mintDbMap(toClone: string[], mintId: (prefix: string) => string): Map<string, string> {
  const dbMap = new Map<string, string>();
  for (const oldId of toClone) dbMap.set(oldId, mintId("db"));
  return dbMap;
}

function mintViewMap(
  toClone: string[],
  state: NotionState,
  mintId: (prefix: string) => string,
): Map<string, string> {
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
  return viewMap;
}

function mintPageMap(
  toClone: string[],
  state: NotionState,
  mintId: (prefix: string) => string,
): Map<string, string> {
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
  return pageMap;
}

function mintIdMaps(
  toClone: string[],
  state: NotionState,
  mintId: (prefix: string) => string,
): IdMaps {
  return {
    dbMap: mintDbMap(toClone, mintId),
    viewMap: mintViewMap(toClone, state, mintId),
    pageMap: mintPageMap(toClone, state, mintId),
  };
}

function cloneDatabase(
  oldDbId: string,
  state: NotionState,
  maps: IdMaps,
  clonedDbSet: Set<string>,
): { id: string; db: NotionState["databases"][string] } {
  const oldDb = state.databases[oldDbId];
  const newDbId = maps.dbMap.get(oldDbId)!;
  const newProps: Record<string, unknown> = {};
  for (const [propId, prop] of Object.entries(oldDb.properties ?? {})) {
    const clonedProp = structuredClone(prop) as {
      relationConfig?: { databaseId?: string };
    };
    const rc = clonedProp.relationConfig;
    if (rc && typeof rc.databaseId === "string" && clonedDbSet.has(rc.databaseId)) {
      clonedProp.relationConfig = { ...rc, databaseId: maps.dbMap.get(rc.databaseId)! };
    }
    newProps[propId] = clonedProp;
  }
  const newViewOrder = Array.isArray(oldDb.viewOrder)
    ? oldDb.viewOrder.map((vId) => (maps.viewMap.has(vId) ? maps.viewMap.get(vId)! : vId))
    : oldDb.viewOrder;
  const newDefaultTemplateId =
    typeof oldDb.defaultTemplateId === "string" && maps.pageMap.has(oldDb.defaultTemplateId)
      ? maps.pageMap.get(oldDb.defaultTemplateId)!
      : oldDb.defaultTemplateId;
  const newDb = {
    ...structuredClone(oldDb),
    id: newDbId,
    properties: newProps as NotionState["databases"][string]["properties"],
    viewOrder: newViewOrder,
    defaultTemplateId: newDefaultTemplateId,
  };
  return { id: newDbId, db: newDb };
}

function cloneView(
  oldViewId: string,
  state: NotionState,
  maps: IdMaps,
): { id: string; view: NotionState["views"][string] } {
  const oldView = state.views[oldViewId];
  const newViewId = maps.viewMap.get(oldViewId)!;
  const newDatabaseId = maps.dbMap.has(oldView.databaseId)
    ? maps.dbMap.get(oldView.databaseId)!
    : oldView.databaseId;
  const clonedView = structuredClone(oldView);
  clonedView.id = newViewId;
  clonedView.databaseId = newDatabaseId;
  const settings = clonedView.settings as { dashboardWidgets?: { viewId?: string }[] } | undefined;
  if (settings && Array.isArray(settings.dashboardWidgets)) {
    settings.dashboardWidgets = settings.dashboardWidgets.map((widget) => {
      if (widget && typeof widget.viewId === "string" && maps.viewMap.has(widget.viewId)) {
        return { ...widget, viewId: maps.viewMap.get(widget.viewId)! };
      }
      return widget;
    });
  }
  return { id: newViewId, view: clonedView };
}

function cloneRecord(
  oldPageId: string,
  state: NotionState,
  maps: IdMaps,
): { id: string; page: NotionState["pages"][string] } {
  const oldPage = state.pages[oldPageId];
  const newPageId = maps.pageMap.get(oldPageId)!;
  const newDatabaseId = maps.dbMap.has(oldPage.databaseId)
    ? maps.dbMap.get(oldPage.databaseId)!
    : oldPage.databaseId;
  const clonedPage = structuredClone(oldPage);
  clonedPage.id = newPageId;
  clonedPage.databaseId = newDatabaseId;
  const props = (clonedPage.properties ?? {}) as Record<string, unknown>;
  const newProps: Record<string, unknown> = { ...props };
  for (const [propId, val] of Object.entries(props)) {
    if (Array.isArray(val)) {
      newProps[propId] = val.map((v) =>
        typeof v === "string" && maps.pageMap.has(v) ? maps.pageMap.get(v)! : v,
      );
    } else if (typeof val === "string" && maps.pageMap.has(val)) {
      newProps[propId] = maps.pageMap.get(val)!;
    }
  }
  clonedPage.properties = newProps as NotionState["pages"][string]["properties"];
  return { id: newPageId, page: clonedPage };
}

function remapContentBlocks(content: Block[], maps: IdMaps): Block[] {
  const newContent = structuredClone(content) as Block[];
  const remap = (blocks: Block[] | undefined): void => {
    if (!blocks) return;
    for (const block of blocks) {
      if (block.type === "database_inline" || block.type === "database_full_page") {
        if (typeof block.databaseId === "string" && maps.dbMap.has(block.databaseId)) {
          block.databaseId = maps.dbMap.get(block.databaseId)!;
          if (typeof block.viewId === "string" && maps.viewMap.has(block.viewId)) {
            block.viewId = maps.viewMap.get(block.viewId)!;
          }
        }
      }
      if (block.children) remap(block.children);
      if (block.layoutCells) {
        for (const cell of block.layoutCells) remap(cell.blocks);
      }
    }
  };
  remap(newContent);
  return newContent;
}

function buildCreated(
  toClone: string[],
  maps: IdMaps,
  newDatabases: NotionState["databases"],
  newViews: NotionState["views"],
): CreatedEntry[] {
  return toClone.map((oldDbId) => {
    const newDbId = maps.dbMap.get(oldDbId)!;
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
}

export function cloneTemplateDatabases(
  content: Block[],
  state: NotionState,
  mintId: (prefix: string) => string,
): { content: Block[]; state: NotionState; created: CreatedEntry[] } {
  const toClone = collectEmbeddedDatabaseIds(content, state);
  if (toClone.length === 0) {
    return { content, state, created: [] };
  }

  const clonedDbSet = new Set(toClone);
  const maps = mintIdMaps(toClone, state, mintId);

  const newDatabases: NotionState["databases"] = { ...state.databases };
  const newViews: NotionState["views"] = { ...state.views };
  const newPages: NotionState["pages"] = { ...state.pages };

  for (const oldDbId of toClone) {
    const { id, db } = cloneDatabase(oldDbId, state, maps, clonedDbSet);
    newDatabases[id] = db;
  }
  for (const oldViewId of maps.viewMap.keys()) {
    const { id, view } = cloneView(oldViewId, state, maps);
    newViews[id] = view;
  }
  for (const oldPageId of maps.pageMap.keys()) {
    const { id, page } = cloneRecord(oldPageId, state, maps);
    newPages[id] = page;
  }

  const newContent = remapContentBlocks(content, maps);
  const created = buildCreated(toClone, maps, newDatabases, newViews);

  const nextState = { databases: newDatabases, pages: newPages, views: newViews } as NotionState;
  return { content: newContent, state: nextState, created };
}
