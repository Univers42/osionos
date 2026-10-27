/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysDatabaseState.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * Read-only adapter behind the `sys:` databases: the caller's own pages, tasks, published
 * pages, connections, workspaces and sessions, read from `GET /api/account/self-data/<source>`.
 * It is never registered as a data-source provider and never touches the known-database
 * store, localStorage or `/api/object-databases`: rows live in this module's own Map and
 * are dropped when the signed-in session changes, so one account's rows never show for
 * the next.
 *
 * Caveat: the session signal is `activeUserId:accessToken`. A silent token refresh drops
 * the cache and reloads (one extra request, never stale rows). The bridge caps an answer
 * at 200 rows and says so with `truncated`; rows beyond that are not reachable here.
 */

import type { ChangeEvent, NotionState, Page, PageQuery, PropertyType, SchemaProperty } from "@notion-db/object-database";
import { useUserStore } from "@/features/auth";
import type { PersistableObjectDatabaseAdapter } from "./knownDatabaseState";
import { UNKNOWN_TIME, viewStateChanged } from "./readOnlyPersist";
import { sysBuiltInViewIds, sysEditableBuiltInViewIds, sysSourceById, SYS_VIEW_TYPE, type SysColumnType, type SysSource } from "./sysDataSources";
import type { SysTransport } from "./sysDatabaseTransport";
import { deleteSavedView, diffViews, fetchSavedViews, saveSavedView } from "./sysDatabaseViews";
import { synthOptions } from "./workspaceDatabaseMappers";

type Row = Record<string, unknown>;
interface SelfDataAnswer { ok: boolean; source: string; columns: string[]; rows: Row[]; truncated: boolean }
export interface SysLoaded { state: NotionState; truncated: boolean }
export interface SysStatus { truncated: boolean; error: string | null }

const TIME_COLUMNS = ["updated_at", "created_at", "last_seen_at", "published_at"];

/** Text shown in a cell: a person object shows its name, other objects their JSON. */
function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" && name ? name : JSON.stringify(value);
  }
  return String(value);
}

function cellValue(type: SysColumnType, value: unknown): unknown {
  if (type === "checkbox") return value === true;
  return cellText(value);
}

function recordId(source: SysSource, row: Row, index: number): string {
  if (source.source === "my-tasks") return `${String(row.page_id)}:${String(row.block_id)}`;
  const id = row.id ?? row.token ?? row.workspace_id;
  return typeof id === "string" && id ? id : `row-${index}`;
}

/** One row per person, newest first. Caveat: a peer without `userId` is kept as its own row. */
export function dedupeConnectionsByPerson(rows: Row[]): Row[] {
  const newest = new Map<string, Row>();
  const loose: Row[] = [];
  for (const row of rows) {
    const userId = (row.peer as { userId?: unknown } | null)?.userId;
    if (typeof userId !== "string") { loose.push(row); continue; }
    const kept = newest.get(userId);
    if (!kept || String(row.created_at ?? "") > String(kept.created_at ?? "")) newest.set(userId, row);
  }
  return [...newest.values(), ...loose].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

function isAnswer(body: unknown): body is SelfDataAnswer {
  const a = body as Partial<SelfDataAnswer> | null;
  return !!a && a.ok === true && Array.isArray(a.columns) && Array.isArray(a.rows);
}

function timeOf(row: Row): string {
  for (const key of TIME_COLUMNS) if (typeof row[key] === "string") return row[key] as string;
  return UNKNOWN_TIME;
}

/** The source's built-in views (a chart beside the default table), empty filters and sorts. */
const builtInViews = (source: SysSource, databaseId: string): NotionState["views"] => Object.fromEntries(
  (source.builtInViews ?? []).map((view) => [view.id, {
    id: view.id, databaseId, name: view.name, type: view.type,
    filters: [], filterConjunction: "and", sorts: [], visibleProperties: [], settings: view.settings,
  }]),
) as NotionState["views"];

/** Throws on an unknown source, a failed request or a malformed answer: never an empty state. */
export async function loadSysSourceState(sourceId: string, transport: SysTransport): Promise<SysLoaded> {
  const source = sysSourceById(sourceId);
  if (!source) throw new Error(`Unknown data source ${sourceId}`);
  const body = await transport.get<unknown>(`/api/account/self-data/${source.source}`);
  if (!isAnswer(body)) throw new Error(`The ${source.label} answer was not understood.`);
  const rows = source.source === "my-connections" ? dedupeConnectionsByPerson(body.rows) : body.rows;

  const typeOf = (column: string): SysColumnType => source.columnTypes[column] ?? "text";
  const properties: Record<string, SchemaProperty> = {};
  for (const column of body.columns) {
    const type = typeOf(column);
    const id = column;
    if (column === source.titleColumn) { properties[id] = { id, name: "Name", type: "title" }; continue; }
    const base = { id, name: column.replace(/_/g, " "), type: type as PropertyType };
    properties[id] = type === "select"
      ? { ...base, options: synthOptions([...(source.columnOptions?.[column] ?? []), ...rows.map((row) => cellText(row[column]) ?? "")]) }
      : base;
  }

  const pages: Record<string, Page> = {};
  rows.forEach((row, index) => {
    let id = recordId(source, row, index);
    if (pages[id]) id = `${id}#${index}`;
    const values: Record<string, unknown> = {};
    for (const column of body.columns) values[column] = cellValue(typeOf(column), row[column]);
    const at = timeOf(row);
    pages[id] = {
      id, databaseId: sourceId, properties: values as Page["properties"], content: [],
      icon: typeof row.icon === "string" ? row.icon : undefined,
      createdAt: typeof row.created_at === "string" ? row.created_at : at, updatedAt: at,
      createdBy: "You", lastEditedBy: "You",
    };
  });

  const hidden = new Set([source.titleColumn, ...source.hiddenColumns]);
  return {
    truncated: body.truncated === true,
    state: {
      databases: { [sourceId]: {
        id: sourceId, name: source.label, icon: source.icon, description: source.description,
        titlePropertyId: source.titleColumn, properties,
      } },
      pages,
      views: { ...builtInViews(source, sourceId), [source.defaultViewId]: {
        id: source.defaultViewId, databaseId: sourceId, name: source.label, type: SYS_VIEW_TYPE,
        filters: [], filterConjunction: "and", sorts: [],
        visibleProperties: body.columns.filter((column) => !hidden.has(column)),
        settings: { showRowNumbers: true, openPagesIn: "side_peek" },
      } },
    },
  };
}

/* ── cache + session ─────────────────────────────────────────────────────── */

interface SessionShape { activeUserId?: string | null; sessions?: Record<string, { accessToken?: string } | undefined> }
const signalOf = (s: SessionShape): string => `${s.activeUserId ?? ""}:${s.sessions?.[s.activeUserId ?? ""]?.accessToken ?? ""}`;
export const sysSessionSignal = (): string => signalOf(useUserStore.getState() as unknown as SessionShape);

const cache = new Map<string, SysLoaded>();
export const getSysSourceStateCacheSize = (): number => cache.size;
export const clearSysSourceStateCache = (): void => { cache.clear(); };

class SysDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();
  private readonly watchers = new Set<(status: SysStatus) => void>();
  private readonly failureWatchers = new Set<(message: string) => void>();
  // What the bridge holds, as of the last load or confirmed write. The host's own diff
  // alone re-saves a loaded view after a reload (its baseline is the pre-load state).
  private held: NotionState["views"] = {};

  private readonly sourceId: string;
  private readonly transport: SysTransport;

  constructor(sourceId: string, transport: SysTransport) {
    this.sourceId = sourceId;
    this.transport = transport;
  }

  async loadState(): Promise<NotionState> {
    const signal = sysSessionSignal();
    try {
      // Saved views are an extra: a failure there never hides the rows.
      const [loaded, saved] = await Promise.all([
        loadSysSourceState(this.sourceId, this.transport),
        fetchSavedViews(this.slug(), this.transport).catch(() => ({})),
      ]);
      const source = sysSourceById(this.sourceId);
      const editableIds = sysEditableBuiltInViewIds(source);
      const mergedViews = mergeSysViews(loaded.state.views, saved, editableIds);
      // Baseline includes the shipped built-ins so an unchanged editable built-in
      // is not mistaken for a user-created view and PUT on first load.
      this.held = { ...loaded.state.views, ...saved };
      const merged: SysLoaded = { ...loaded, state: { ...loaded.state, views: mergedViews } };
      if (sysSessionSignal() === signal) cache.set(this.sourceId, merged);
      this.announce({ truncated: loaded.truncated, error: null });
      return merged.state;
    } catch (error) {
      cache.delete(this.sourceId);
      this.announce({ truncated: false, error: error instanceof Error ? error.message : "Could not load your data." });
      throw error;
    }
  }

  private pages(): Record<string, Page> { return cache.get(this.sourceId)?.state.pages ?? {}; }

  async findPages(query: PageQuery): Promise<Page[]> {
    const all = Object.values(this.pages());
    return typeof query.limit === "number" ? all.slice(0, query.limit) : all;
  }

  async getPage(id: string): Promise<Page | null> { return this.pages()[id] ?? null; }

  // Read-only: a write asks the host to reload what the bridge says, discarding the edit.
  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    this.reload();
    return { ...page, id: `pending-${Date.now()}`, databaseId };
  }

  async patchPage(id: string): Promise<Page> {
    this.reload();
    const found = this.pages()[id];
    if (!found) throw new Error(`Record ${id} not found`);
    return found;
  }

  async deletePage(): Promise<void> { this.reload(); }
  async addProperty(_databaseId: string, _prop: SchemaProperty): Promise<void> { /* read-only schema */ }
  async removeProperty(): Promise<void> { /* read-only schema */ }
  async changePropertyType(_databaseId: string, _propertyId: string, _newType: PropertyType): Promise<void> { /* read-only schema */ }

  // Arrow: the host calls it detached. Only a rows/schema edit reloads; a sort or filter
  // change (views only) is the viewer's own and must survive.
  persistState = (next: NotionState, previous?: NotionState): void => {
    if (previous && viewStateChanged({ ...next, views: {} }, { ...previous, views: {} })) this.reload();
    this.persistViews(next, previous);
  };

  // Only `views` leaves here, and only the ones that differ from the host's previous state.
  private persistViews(next: NotionState, previous?: NotionState): void {
    // No baseline, no diff: the host's own post-load persist (with the record limit's
    // loadLimit already folded in) must not be mistaken for an edit.
    const source = sysSourceById(this.sourceId);
    if (!source || !previous) return;
    const edit = diffViews(next.views, previous.views, sysBuiltInViewIds(source));
    const unsent = diffViews(next.views, this.held, sysBuiltInViewIds(source));
    const sendable = new Set(unsent.saved.map(([id]) => id));
    const goneable = new Set(unsent.removed);
    for (const [id, view] of edit.saved.filter(([id]) => sendable.has(id))) {
      saveSavedView(source.source, id, view, this.transport)
        .then(() => { this.held = { ...this.held, [id]: view }; })
        .catch((error: unknown) => this.failed(error));
    }
    for (const id of edit.removed.filter((id) => goneable.has(id))) {
      // Caveat: deleting an editable built-in removes only its saved copy; the shipped definition comes back on the next load.
      deleteSavedView(source.source, id, this.transport)
        .then(() => { const rest = { ...this.held }; delete rest[id]; this.held = rest; })
        .catch((error: unknown) => this.failed(error));
    }
  }

  // The bridge names a source by its slug (`my-pages`); the database id is `sys:my-pages`.
  private slug(): string { return sysSourceById(this.sourceId)?.source ?? this.sourceId; }

  private failed(error: unknown): void {
    const message = error instanceof Error ? error.message : "Could not save this view.";
    for (const watcher of this.failureWatchers) watcher(message);
  }

  watchSaveFailure(callback: (message: string) => void): () => void {
    this.failureWatchers.add(callback);
    return () => { this.failureWatchers.delete(callback); };
  }

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    const off = useUserStore.subscribe((now, before) => {
      if (signalOf(now as unknown as SessionShape) === signalOf(before as unknown as SessionShape)) return;
      cache.clear();
      this.reload();
    });
    return () => { this.subscribers.delete(callback); off(); };
  }

  watchStatus(callback: (status: SysStatus) => void): () => void {
    this.watchers.add(callback);
    return () => { this.watchers.delete(callback); };
  }

  reload(): void {
    queueMicrotask(() => { for (const callback of this.subscribers) callback({ type: "state-replaced" }); });
  }

  private announce(status: SysStatus): void { for (const watcher of this.watchers) watcher(status); }
}

const adapters = new Map<string, SysDatabaseAdapter>();

/** One cached adapter per source. */
export function getSysDatabaseAdapter(sourceId: string, transport: SysTransport): SysDatabaseAdapter {
  let adapter = adapters.get(sourceId);
  if (!adapter) { adapter = new SysDatabaseAdapter(sourceId, transport); adapters.set(sourceId, adapter); }
  return adapter;
}

/** A `sys:` source's views after load: the shipped definitions win (the default table and
 *  non-editable built-ins), except an editable built-in the user saved a copy of. */
export function mergeSysViews(loaded: NotionState["views"], saved: NotionState["views"], editableIds: readonly string[]): NotionState["views"] {
  const merged = { ...saved, ...loaded };
  for (const id of editableIds) if (saved[id]) merged[id] = saved[id];
  return merged;
}
