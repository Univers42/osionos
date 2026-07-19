/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   browserSearch.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { codeBlockOf } from "./codeFile";

export interface SearchMatch {
  lineNumber: number;
  /** The full line text (trimmed for display), match highlighted by the UI. */
  line: string;
  column: number;
}

export interface SearchFileResult {
  pageId: string;
  title: string;
  matches: SearchMatch[];
}

const MAX_MATCHES_PER_FILE = 50;
const MAX_TOTAL_MATCHES = 500;

/**
 * Client-side global search across the workspace's loaded code files — grep over
 * the page store (the canonical content is already in memory). Case-insensitive
 * substring; caps per-file and total matches so a broad query can't freeze the
 * UI. P7 adds a container-backed ripgrep for the on-disk tree; this covers the
 * common "find in open project" without any backend.
 */
export function searchCodeFiles(pages: PageEntry[], rawQuery: string): SearchFileResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];

  const results: SearchFileResult[] = [];
  let total = 0;

  for (const page of pages) {
    if (page.archivedAt || page.surface !== "code") continue;
    const content = codeBlockOf(page)?.content;
    if (!content || !content.toLowerCase().includes(query)) continue;

    const matches: SearchMatch[] = [];
    const lines = content.split("\n");
    for (let index = 0; index < lines.length && matches.length < MAX_MATCHES_PER_FILE; index++) {
      const column = lines[index].toLowerCase().indexOf(query);
      if (column === -1) continue;
      matches.push({ lineNumber: index + 1, line: lines[index].trim().slice(0, 200), column });
      total += 1;
      if (total >= MAX_TOTAL_MATCHES) break;
    }
    if (matches.length) results.push({ pageId: page._id, title: page.title, matches });
    if (total >= MAX_TOTAL_MATCHES) break;
  }

  return results;
}
