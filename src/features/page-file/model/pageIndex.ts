/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageIndex.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

import type { PageFileKind } from "./types";

// LANE I STUB — lane C (feat/ide-mounts) implements buildPageIndex. Pure: no store import.

export interface PageIndexEntry {
  id: string;
  /** Workspace-relative POSIX path, as pathForEntry produces it. */
  path: string;
  kind: PageFileKind;
  parentId: string | null;
}

export interface PageIndex {
  readonly entries: readonly PageIndexEntry[];
  idForPath(path: string): string | undefined;
  pathForId(id: string): string | undefined;
}

/** Index every live page of one workspace: O(n) maps, built once per pages array. */
export function buildPageIndex(pages: readonly PageEntry[]): PageIndex {
  throw new Error(`buildPageIndex(${pages.length} pages): not implemented (lane C)`);
}
