/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateSlice.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A catalogue template's example databases arrive as a SLICE: an input to the
// clone, never a state to store. cloneFromSlice runs the clone on live+slice,
// then strips the slice back out, so what comes back is the user's databases
// plus the fresh clones — no catalogue original survives into a state a caller
// may store (TD8, TD9). Pure: no store, no mutation of live or slice.

import type { Block } from "@/entities/block";
import type { NotionState } from "@notion-db/object-database";
import { cloneTemplateDatabases, type CreatedEntry } from "@/widgets/database-view/model/templateDatabaseClone";

/** The three maps a template's example databases are handed to the clone in. */
export type DatabaseSlice = Pick<NotionState, "databases" | "views" | "pages">;

/** A template as apply sees it: its blocks plus its example databases — inputs only (TD8). */
export interface TemplateSource {
  id: string;
  title: string;
  content: Block[] | undefined;
  databases: DatabaseSlice;
}

/** The clone's input: the user's state with the slice's ids visible to it. On a shared
 *  key the user's entry wins, so the clone never reads or keeps the slice's copy (TD11). */
function mergeSlice(live: NotionState, slice: DatabaseSlice): NotionState {
  return {
    databases: { ...slice.databases, ...live.databases },
    views: { ...slice.views, ...live.views },
    pages: { ...slice.pages, ...live.pages },
  };
}

const hasKey = (map: object, key: string): boolean => Object.prototype.hasOwnProperty.call(map, key);

/** A slice key that is not also a live key is a catalogue original: dropped. A key
 *  the user already owns keeps its data, whatever the slice says about it (TD11). */
function withoutSliceKeys<T>(result: Record<string, T>, slice: Record<string, T>, live: Record<string, T>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(result)) {
    if (hasKey(slice, key) && !hasKey(live, key)) continue;
    next[key] = value;
  }
  return next;
}

/** Live + the clones, nothing else (TD9). */
function stripSlice(cloned: NotionState, slice: DatabaseSlice, live: NotionState): NotionState {
  return {
    databases: withoutSliceKeys(cloned.databases, slice.databases, live.databases),
    views: withoutSliceKeys(cloned.views, slice.views, live.views),
    pages: withoutSliceKeys(cloned.pages, slice.pages, live.pages),
  };
}

/** Fresh content cloned against live + slice. The returned state is live plus the
 *  clones, exactly; neither `live` nor `slice` is mutated. */
export function cloneFromSlice(
  content: Block[],
  slice: DatabaseSlice,
  live: NotionState,
  mintId: (prefix: string) => string,
): { content: Block[]; state: NotionState; created: CreatedEntry[] } {
  const cloned = cloneTemplateDatabases(content, mergeSlice(live, slice), mintId);
  return { content: cloned.content, state: stripSlice(cloned.state, slice, live), created: cloned.created };
}
