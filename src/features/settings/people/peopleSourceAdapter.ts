/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleSourceAdapter.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A thin ObjectDatabaseAdapter that re-fetches a People source on every load and
 * delegates reads to a stock InMemoryAdapter. It intentionally has NO
 * persistState: the views are read projections and all writes go through the
 * existing bridge clients (peopleActions), after which the panel calls
 * `refresh()` to make the host reload. This sidesteps the persist/reload diff
 * interference that the live workspace adapter has to guard against.
 */

import {
  InMemoryAdapter,
  type ChangeEvent,
  type NotionState,
  type ObjectDatabaseAdapter,
  type Page,
  type PageQuery,
  type PropertyType,
  type SchemaProperty,
} from "@notion-db/object-database";

export class PeopleSourceAdapter implements ObjectDatabaseAdapter {
  private inner = new InMemoryAdapter();

  private readonly subscribers = new Set<(event: ChangeEvent) => void>();

  constructor(private readonly build: () => Promise<NotionState>) {}

  async loadState(): Promise<NotionState> {
    const state = await this.build();
    this.inner = new InMemoryAdapter(state);
    return state;
  }

  findPages(query: PageQuery): Promise<Page[]> {
    return this.inner.findPages(query);
  }

  getPage(id: string): Promise<Page | null> {
    return this.inner.getPage(id);
  }

  // Writes flow through peopleActions, not the contract CRUD methods; these
  // just nudge the host to reload so nothing edits the live data locally.
  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    this.refresh();
    return { ...page, id: `transient-${databaseId}`, databaseId };
  }

  async patchPage(id: string): Promise<Page> {
    this.refresh();
    const page = await this.inner.getPage(id);
    if (!page) throw new Error(`People row ${id} not found`);
    return page;
  }

  async deletePage(): Promise<void> { this.refresh(); }
  async addProperty(_databaseId: string, _prop: SchemaProperty): Promise<void> { /* fixed schema */ }
  async removeProperty(): Promise<void> { /* fixed schema */ }
  async changePropertyType(_databaseId: string, _propertyId: string, _newType: PropertyType): Promise<void> { /* fixed schema */ }

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }

  /** Ask the host to re-run loadState (call after a write through peopleActions). */
  refresh(): void {
    this.emit({ type: "state-replaced" });
  }

  private emit(event: ChangeEvent): void {
    queueMicrotask(() => { for (const callback of this.subscribers) callback(event); });
  }
}
