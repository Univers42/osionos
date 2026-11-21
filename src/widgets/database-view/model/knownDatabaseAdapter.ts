import type {
  ChangeEvent,
  NotionState,
  ObjectDatabaseAdapter,
  Page,
  PageQuery,
  PropertyType,
  SchemaProperty,
} from "@notion-db/object-database";

import { applyAdapterOptions, type KnownDatabaseAdapterOptions, withoutProjectedLimits } from "./knownDatabaseViewLimit";
import { deletedPageIdsBetween } from "./knownDatabasePersistedState";
import { clone, createId, shareState } from "./knownDatabaseClone";
import { mergeChangedRecords, matchesPageQuery, normalizeQueryLimit, sortPages } from "./knownDatabasePageQuery";
import { markPageDeleted } from "./knownDatabaseSessionState";
import { useKnownDatabaseStateStore } from "./knownDatabaseStore";

export interface PersistableObjectDatabaseAdapter extends ObjectDatabaseAdapter {
  persistState?: (state: NotionState, previousState?: NotionState) => void;
}

const knownDatabaseAdapterCache = new Map<string, PersistableObjectDatabaseAdapter>();

export function createKnownDatabaseAdapter(options: KnownDatabaseAdapterOptions = {}): PersistableObjectDatabaseAdapter {
  return new KnownDatabaseAdapter(options);
}

export function getCachedKnownDatabaseAdapter(options: KnownDatabaseAdapterOptions): PersistableObjectDatabaseAdapter {
  const cacheKey = `${options.defaultLoadLimit ?? "all"}:${options.recordCap ?? "none"}`;
  const cachedAdapter = knownDatabaseAdapterCache.get(cacheKey);
  if (cachedAdapter) return cachedAdapter;
  const adapter = createKnownDatabaseAdapter(options);
  knownDatabaseAdapterCache.set(cacheKey, adapter);
  return adapter;
}

/** After a server pull merges into the store, nudge every mounted object-database
 *  view (each cached adapter's subscribers) to reload from `loadState()`. */
export function notifyObjectDatabaseAdaptersReloaded(): void {
  for (const adapter of knownDatabaseAdapterCache.values()) {
    (adapter as KnownDatabaseAdapter).notifyStateReplaced();
  }
}

class KnownDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();
  private readonly options: KnownDatabaseAdapterOptions;

  // A plain field, not a parameter property: node's type stripping (the canvas
  // tests) cannot run parameter properties.
  constructor(options: KnownDatabaseAdapterOptions = {}) {
    this.options = options;
  }

  async loadState(): Promise<NotionState> {
    return applyAdapterOptions(shareState(useKnownDatabaseStateStore.getState().state), this.options);
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
    markPageDeleted(id);
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

  // The host persists what it loaded, against its empty initial store: without taking
  // the embed's Limit back out, every paged view of the account was written with it
  // (devil F1, groot ADR 0055: 19 of 45 seed views, and the first-session journal).
  // An arrow field: the host calls it unbound (object_database.tsx:532-551), and a
  // method reading `this.options` threw there and dropped every embed write.
  persistState = (state: NotionState, previousState?: NotionState): void => {
    const current = useKnownDatabaseStateStore.getState().state;
    const views = withoutProjectedLimits(state.views, current.views, this.options, previousState?.views);
    if (!previousState) {
      useKnownDatabaseStateStore.getState().replaceState({ ...state, views });
      return;
    }
    // The host diffs its store against the pre-edit baseline: a page in the
    // baseline that is gone from `state` is a user deletion. Remember it so a
    // reload (or the server union) cannot bring it back.
    for (const pageId of deletedPageIdsBetween(previousState, state)) markPageDeleted(pageId);
    useKnownDatabaseStateStore.getState().replaceState({
      databases: mergeChangedRecords(current.databases, state.databases, previousState.databases),
      pages: mergeChangedRecords(current.pages, state.pages, previousState.pages),
      views: mergeChangedRecords(current.views, views, previousState.views),
    });
  };

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /** Tell mounted views their whole state changed underneath them (a server
   *  pull merged in) so they reload from `loadState()`. */
  notifyStateReplaced(): void {
    this.emit({ type: "state-replaced" } as ChangeEvent);
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
