/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseState.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import type {
  ChangeEvent,
  NotionState,
  ObjectDatabaseAdapter,
  Page,
  PageQuery,
  PropertyType,
  SchemaProperty,
} from "@notion-db/object-database";

import seedState from "@/shared/notion-database-sys/src/store/dbms/mongodb/_notion_state.json";
import { timed } from "@/shared/lib/perf/measure";
import { applyWikiSeed } from "./wikiSeed";
import { applyHomeDemoSeed } from "./homeDemoSeed";
import { applyGradesSeed } from "./gradesSeed";

export const KNOWN_DATABASE_STATE_STORAGE_KEY = "osionos.knownDatabaseState.v1";
const KNOWN_DATABASE_STATE_FLUSH_DELAY_MS = 1000;

type KnownDatabaseStoreState = {
  state: NotionState;
  replaceState: (state: NotionState) => void;
  resetState: () => void;
  updatePageProperty: (pageId: string, propertyId: string, value: unknown) => void;
};

interface KnownDatabaseAdapterOptions {
  inlineLoadLimit?: number;
}

export interface PersistableObjectDatabaseAdapter extends ObjectDatabaseAdapter {
  persistState?: (state: NotionState, previousState?: NotionState) => void;
}

const knownDatabaseAdapterCache = new Map<string, PersistableObjectDatabaseAdapter>();
let pendingKnownDatabaseState: NotionState | null = null;
let pendingKnownDatabaseStateMicrotask = false;
let pendingKnownDatabaseStateDebounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
let pendingKnownDatabaseStateIdleHandle: number | null = null;
let pendingKnownDatabaseStateTimeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

type KnownDatabaseRequestIdleCallback = (
  callback: IdleRequestCallback,
  options?: IdleRequestOptions,
) => number;
type KnownDatabaseCancelIdleCallback = (handle: number) => void;

export const useKnownDatabaseStateStore = create<KnownDatabaseStoreState>((set) => ({
  state: loadKnownDatabaseState(),
  replaceState: (state) => set({ state: persistKnownDatabaseState(state) }),
  resetState: () => set({ state: persistKnownDatabaseState(seedSnapshot()) }),
  updatePageProperty: (pageId, propertyId, value) => set((current) => {
    const page = current.state.pages[pageId];
    if (!page) return current;
    return {
      state: persistKnownDatabaseState({
        ...current.state,
        pages: {
          ...current.state.pages,
          [pageId]: {
            ...page,
            properties: { ...page.properties, [propertyId]: value },
            updatedAt: new Date().toISOString(),
            lastEditedBy: "You",
          },
        },
      }),
    };
  }),
}));

export function createKnownDatabaseAdapter(options: KnownDatabaseAdapterOptions = {}): PersistableObjectDatabaseAdapter {
  return new KnownDatabaseAdapter(options);
}

export function getKnownDatabaseAdapter(options: KnownDatabaseAdapterOptions = {}): PersistableObjectDatabaseAdapter {
  const cacheKey = `${options.inlineLoadLimit ?? "all"}`;
  const cachedAdapter = knownDatabaseAdapterCache.get(cacheKey);
  if (cachedAdapter) return cachedAdapter;
  const adapter = createKnownDatabaseAdapter(options);
  knownDatabaseAdapterCache.set(cacheKey, adapter);
  return adapter;
}

export function loadKnownDatabaseState(): NotionState {
  const seeded = seedSnapshot();
  if (pendingKnownDatabaseState) return cloneState(pendingKnownDatabaseState);
  if (globalThis.window === undefined) return seeded;

  try {
    const raw = globalThis.localStorage.getItem(KNOWN_DATABASE_STATE_STORAGE_KEY);
    if (!raw) return seeded;
    return mergeWithSeedState(JSON.parse(raw) as Partial<NotionState>, seeded);
  } catch {
    return seeded;
  }
}

export function persistKnownDatabaseState(state: NotionState): NotionState {
  const nextState = cloneState(state);
  scheduleKnownDatabaseStatePersist(nextState);
  return nextState;
}

export function flushKnownDatabaseStatePersist() {
  cancelKnownDatabaseStateFlush();

  if (!pendingKnownDatabaseState) return;

  const nextState = pendingKnownDatabaseState;
  pendingKnownDatabaseState = null;

  if (globalThis.window !== undefined) {
    timed("persistKnownDatabaseState", () => {
      try {
        globalThis.localStorage.setItem(KNOWN_DATABASE_STATE_STORAGE_KEY, JSON.stringify(nextState));
      } catch {
        // localStorage can be unavailable or quota-limited.
      }
    });
  }
}

if (globalThis.window !== undefined) {
  globalThis.addEventListener("beforeunload", flushKnownDatabaseStatePersist);
}

function scheduleKnownDatabaseStatePersist(state: NotionState) {
  pendingKnownDatabaseState = state;

  if (pendingKnownDatabaseStateMicrotask) return;

  pendingKnownDatabaseStateMicrotask = true;
  queueMicrotask(() => {
    pendingKnownDatabaseStateMicrotask = false;
    scheduleDebouncedKnownDatabaseStateFlush();
  });
}

function scheduleDebouncedKnownDatabaseStateFlush() {
  if (pendingKnownDatabaseStateDebounceHandle !== null) {
    globalThis.clearTimeout(pendingKnownDatabaseStateDebounceHandle);
  }

  pendingKnownDatabaseStateDebounceHandle = globalThis.setTimeout(() => {
    pendingKnownDatabaseStateDebounceHandle = null;
    scheduleIdleKnownDatabaseStateFlush();
  }, KNOWN_DATABASE_STATE_FLUSH_DELAY_MS);
}

function scheduleIdleKnownDatabaseStateFlush() {
  if (pendingKnownDatabaseStateIdleHandle !== null || pendingKnownDatabaseStateTimeoutHandle !== null) return;

  const requestIdle = (globalThis as typeof globalThis & {
    requestIdleCallback?: KnownDatabaseRequestIdleCallback;
  }).requestIdleCallback;

  if (requestIdle) {
    pendingKnownDatabaseStateIdleHandle = requestIdle(() => {
      pendingKnownDatabaseStateIdleHandle = null;
      flushKnownDatabaseStatePersist();
    });
    return;
  }

  pendingKnownDatabaseStateTimeoutHandle = globalThis.setTimeout(() => {
    pendingKnownDatabaseStateTimeoutHandle = null;
    flushKnownDatabaseStatePersist();
  }, 0);
}

function cancelKnownDatabaseStateFlush() {
  if (pendingKnownDatabaseStateDebounceHandle !== null) {
    globalThis.clearTimeout(pendingKnownDatabaseStateDebounceHandle);
    pendingKnownDatabaseStateDebounceHandle = null;
  }

  if (pendingKnownDatabaseStateTimeoutHandle !== null) {
    globalThis.clearTimeout(pendingKnownDatabaseStateTimeoutHandle);
    pendingKnownDatabaseStateTimeoutHandle = null;
  }

  if (pendingKnownDatabaseStateIdleHandle === null) return;

  const cancelIdle = (globalThis as typeof globalThis & {
    cancelIdleCallback?: KnownDatabaseCancelIdleCallback;
  }).cancelIdleCallback;

  if (cancelIdle) {
    cancelIdle(pendingKnownDatabaseStateIdleHandle);
  } else {
    globalThis.clearTimeout(pendingKnownDatabaseStateIdleHandle);
  }

  pendingKnownDatabaseStateIdleHandle = null;
}

class KnownDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();

  constructor(private readonly options: KnownDatabaseAdapterOptions = {}) {}

  async loadState(): Promise<NotionState> {
    return applyAdapterOptions(cloneState(useKnownDatabaseStateStore.getState().state), this.options);
  }

  async findPages(query: PageQuery): Promise<Page[]> {
    const state = useKnownDatabaseStateStore.getState().state;
    const limit = normalizeQueryLimit(query.limit);
    const shouldSort = Boolean(query.sort?.length);
    const pages: Page[] = [];

    if (limit === 0) return [];

    for (const pageId in state.pages) {
      const page = state.pages[pageId];
      if (!matchesPageQuery(page, query)) continue;
      pages.push(page);
      if (!shouldSort && limit !== undefined && pages.length >= limit) break;
    }

    if (shouldSort) {
      const sortedPages = sortPages(pages, query.sort ?? []);
      return (limit === undefined ? sortedPages : sortedPages.slice(0, limit)).map(clone);
    }

    return pages.map(clone);
  }

  async getPage(id: string): Promise<Page | null> {
    return clone(useKnownDatabaseStateStore.getState().state.pages[id] ?? null);
  }

  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    const inserted: Page = { ...clone(page), id: createId("page"), databaseId };
    this.updateState((state) => ({
      ...state,
      pages: { ...state.pages, [inserted.id]: inserted },
    }));
    this.emit({ type: "page-inserted", page: clone(inserted) });
    return clone(inserted);
  }

  async patchPage(id: string, changes: Partial<Page["properties"]>): Promise<Page> {
    const state = useKnownDatabaseStateStore.getState().state;
    const page = state.pages[id];
    if (!page) throw new Error(`Page ${id} not found`);
    const updated: Page = {
      ...page,
      properties: { ...page.properties, ...clone(changes) },
      updatedAt: new Date().toISOString(),
      lastEditedBy: "You",
    };
    this.updateState((current) => ({
      ...current,
      pages: { ...current.pages, [id]: updated },
    }));
    this.emit({ type: "page-changed", pageId: id, databaseId: updated.databaseId, changes: clone(changes) });
    return clone(updated);
  }

  async deletePage(id: string): Promise<void> {
    const databaseId = useKnownDatabaseStateStore.getState().state.pages[id]?.databaseId;
    this.updateState((state) => {
      const pages = { ...state.pages };
      delete pages[id];
      return { ...state, pages };
    });
    this.emit({ type: "page-deleted", pageId: id, databaseId });
  }

  async addProperty(databaseId: string, prop: SchemaProperty): Promise<void> {
    this.updateState((state) => {
      const database = state.databases[databaseId];
      if (!database) return state;
      const pages = Object.fromEntries(Object.entries(state.pages).map(([pageId, page]) => [
        pageId,
        page.databaseId === databaseId
          ? { ...page, properties: { ...page.properties, [prop.id]: page.properties[prop.id] ?? null } }
          : page,
      ]));
      return {
        ...state,
        databases: {
          ...state.databases,
          [databaseId]: { ...database, properties: { ...database.properties, [prop.id]: clone(prop) } },
        },
        pages,
      };
    });
    this.emit({ type: "schema-changed", databaseId });
  }

  async removeProperty(databaseId: string, propertyId: string): Promise<void> {
    this.updateState((state) => {
      const database = state.databases[databaseId];
      if (!database) return state;
      const properties = { ...database.properties };
      delete properties[propertyId];
      const pages = Object.fromEntries(Object.entries(state.pages).map(([pageId, page]) => {
        if (page.databaseId !== databaseId) return [pageId, page];
        const pageProperties = { ...page.properties };
        delete pageProperties[propertyId];
        return [pageId, { ...page, properties: pageProperties }];
      }));
      const views = Object.fromEntries(Object.entries(state.views).map(([viewId, view]) => [
        viewId,
        view.databaseId === databaseId
          ? { ...view, visibleProperties: view.visibleProperties.filter((id) => id !== propertyId) }
          : view,
      ]));
      return {
        ...state,
        databases: { ...state.databases, [databaseId]: { ...database, properties } },
        pages,
        views,
      };
    });
    this.emit({ type: "schema-changed", databaseId });
  }

  async changePropertyType(databaseId: string, propertyId: string, newType: PropertyType): Promise<void> {
    this.updateState((state) => {
      const database = state.databases[databaseId];
      const property = database?.properties[propertyId];
      if (!database || !property) return state;
      return {
        ...state,
        databases: {
          ...state.databases,
          [databaseId]: {
            ...database,
            properties: { ...database.properties, [propertyId]: { ...property, type: newType } },
          },
        },
      };
    });
    this.emit({ type: "schema-changed", databaseId });
  }

  persistState(state: NotionState, previousState?: NotionState): void {
    if (!previousState) {
      useKnownDatabaseStateStore.getState().replaceState(state);
      return;
    }
    const current = useKnownDatabaseStateStore.getState().state;
    useKnownDatabaseStateStore.getState().replaceState({
      databases: mergeChangedRecords(current.databases, state.databases, previousState.databases),
      pages: mergeChangedRecords(current.pages, state.pages, previousState.pages),
      views: mergeChangedRecords(current.views, state.views, previousState.views),
    });
  }

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private updateState(update: (state: NotionState) => NotionState): void {
    useKnownDatabaseStateStore.getState().replaceState(update(useKnownDatabaseStateStore.getState().state));
  }

  private emit(event: ChangeEvent): void {
    queueMicrotask(() => {
      for (const callback of this.subscribers) callback(event);
    });
  }
}

function mergeWithSeedState(stored: Partial<NotionState>, seeded: NotionState): NotionState {
  const storedDatabases = isRecord(stored.databases) ? stored.databases : {};
  const storedPages = isRecord(stored.pages) ? stored.pages : {};
  const storedViews = isRecord(stored.views) ? stored.views : {};
  return {
    databases: mergeDatabases(seeded.databases, storedDatabases),
    pages: { ...seeded.pages, ...storedPages },
    views: { ...seeded.views, ...storedViews },
  };
}

function applyAdapterOptions(state: NotionState, options: KnownDatabaseAdapterOptions): NotionState {
  if (!options.inlineLoadLimit) return state;
  const loadLimit = Math.max(1, Math.round(options.inlineLoadLimit));
  return {
    ...state,
    views: Object.fromEntries(Object.entries(state.views).map(([viewId, view]) => {
      if (view.type !== "table" && view.type !== "list" && view.type !== "timeline") return [viewId, view];
      const currentLimit = Number(view.settings?.loadLimit);
      return [viewId, {
        ...view,
        settings: {
          ...view.settings,
          loadLimit: Number.isFinite(currentLimit) ? Math.min(currentLimit, loadLimit) : loadLimit,
        },
      }];
    })),
  };
}

function mergeDatabases(seedDatabases: NotionState["databases"], storedDatabases: NotionState["databases"]): NotionState["databases"] {
  const merged: NotionState["databases"] = { ...seedDatabases };
  for (const [databaseId, database] of Object.entries(storedDatabases)) {
    const seedDatabase = seedDatabases[databaseId];
    merged[databaseId] = seedDatabase
      ? { ...seedDatabase, ...database, properties: { ...seedDatabase.properties, ...database.properties } }
      : database;
  }
  return merged;
}

function mergeChangedRecords<TRecord>(
  currentRecords: Record<string, TRecord>,
  nextRecords: Record<string, TRecord>,
  previousRecords: Record<string, TRecord>,
): Record<string, TRecord> {
  const merged = { ...currentRecords };
  for (const [recordId, nextRecord] of Object.entries(nextRecords)) {
    if (previousRecords[recordId] !== nextRecord) merged[recordId] = nextRecord;
  }
  for (const recordId of Object.keys(previousRecords)) {
    if (!(recordId in nextRecords)) delete merged[recordId];
  }
  return merged;
}

function normalizeQueryLimit(limit: PageQuery["limit"]): number | undefined {
  if (limit === undefined) return undefined;
  const numericLimit = Math.floor(Number(limit));
  return Number.isFinite(numericLimit) && numericLimit >= 0 ? numericLimit : undefined;
}

function matchesPageQuery(page: Page, query: PageQuery): boolean {
  if (query.databaseId && page.databaseId !== query.databaseId) return false;
  return query.filter ? matchesDocFilter(page, query.filter) : true;
}

function matchesDocFilter(page: Page, filter: NonNullable<PageQuery["filter"]>): boolean {
  return Object.entries(filter).every(([propertyId, condition]) => matchesCondition(page.properties[propertyId], condition));
}

function matchesCondition(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return matchesExistence(value, condition.exists)
    && matchesEquality(value, condition)
    && matchesInclusion(value, condition)
    && matchesContainment(value, condition.contains)
    && matchesRange(value, condition);
}

function matchesExistence(value: unknown, exists: boolean | undefined): boolean {
  return exists === undefined || (value !== undefined && value !== null && value !== "") === exists;
}

function matchesEquality(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return (condition.eq === undefined || value === condition.eq) && (condition.neq === undefined || value !== condition.neq);
}

function matchesInclusion(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return (condition.in?.includes(value) ?? true) && !(condition.nin?.includes(value) ?? false);
}

function matchesContainment(value: unknown, contains: unknown): boolean {
  return contains === undefined || valueContains(value, contains);
}

function matchesRange(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return (condition.gt === undefined || compareValues(value, condition.gt) > 0)
    && (condition.gte === undefined || compareValues(value, condition.gte) >= 0)
    && (condition.lt === undefined || compareValues(value, condition.lt) < 0)
    && (condition.lte === undefined || compareValues(value, condition.lte) <= 0);
}

function sortPages(pages: Page[], sort: NonNullable<PageQuery["sort"]>): Page[] {
  return [...pages].sort((left, right) => {
    for (const rule of sort) {
      const result = compareValues(left.properties[rule.propertyId], right.properties[rule.propertyId]);
      if (result !== 0) return rule.direction === "asc" ? result : -result;
    }
    return 0;
  });
}

function compareValues(left: unknown, right: unknown): number {
  const leftValue = comparableValue(left);
  const rightValue = comparableValue(right);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function comparableValue(value: unknown): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && value.trim() !== "" ? asNumber : value.toLocaleLowerCase();
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value)) return value.join(", ").toLocaleLowerCase();
  return stringifyUnknown(value).toLocaleLowerCase();
}

function valueContains(value: unknown, needle: unknown): boolean {
  const needleText = stringifyUnknown(needle).toLocaleLowerCase();
  if (Array.isArray(value)) return value.includes(needle) || value.some((item) => stringifyUnknown(item).toLocaleLowerCase().includes(needleText));
  return stringifyUnknown(value).toLocaleLowerCase().includes(needleText);
}

function stringifyUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyUnknown).filter(Boolean).join(", ");
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function seedSnapshot(): NotionState {
  // The Delivery Wiki slice (Milestones ↔ Files), the Home demo slice
  // (Events + Learn), and the Grades slice (grade-calculator template) extend
  // the JSON seed at the same precedence level — stored user state overlays all.
  return applyGradesSeed(applyHomeDemoSeed(applyWikiSeed(cloneState(seedState as NotionState))));
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneState(state: NotionState): NotionState {
  return clone(state);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}