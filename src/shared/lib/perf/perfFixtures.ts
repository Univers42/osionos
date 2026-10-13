/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   perfFixtures.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Browser-side fixtures + metric readers for the Playwright perf layer (tests/e2e/perf).
// Only reachable where loadTest.ts is (the dev server) and only installed when
// isPerfEnabled(). They write through the real page store in ONE setState, so a
// 2 000-page or 500-child fixture costs a single derive, not 2 000 store actions.

import type { PageEntry } from "@/entities/page";
import { createCodeFileBlock } from "@/features/ide/model/codeFile";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState } from "@/store/pageStore.helpers";
import { getPerfDurations, isPerfEnabled, resetPerfMetrics } from "@osionos/perf-probe";
import { createPerfPage, resolvePerfWorkspace } from "./loadTest";

// Not "perf-page-": loadTest's __perfSeed prunes that prefix on every call.
const FIXTURE_PREFIX = "perf-fx-";

export interface PerfFixtureFolder {
  folderId: string;
  folderTitle: string;
  childCount: number;
}

declare global {
  var __perfSeedPages: ((count: number) => number) | undefined;
  var __perfSeedFolder: ((childCount: number) => PerfFixtureFolder) | undefined;
  var __perfOpenCodePage: (() => string) | undefined;
  var __perfDurations: ((name: string) => number[]) | undefined;
  var __perfReset: (() => void) | undefined;
}

function makeFixturePage(id: string, overrides: Partial<PageEntry>): PageEntry {
  const { workspaceId, ownerId } = resolvePerfWorkspace();
  return { ...createPerfPage(id, workspaceId, ownerId), title: id, ...overrides };
}

function addPages(entries: PageEntry[]): void {
  const { workspaceId } = resolvePerfWorkspace();
  usePageStore.setState((state) => derivePageState({
    ...state.pages,
    [workspaceId]: [...(state.pages[workspaceId] ?? []), ...entries],
  }, state.pageIdsByWorkspace));
}

export function perfSeedPages(count: number): number {
  const entries = Array.from({ length: count }, (_, index) => makeFixturePage(
    `${FIXTURE_PREFIX}bulk-${index}`,
    { title: `Bulk page ${index}`, content: [{ id: `${FIXTURE_PREFIX}b-${index}`, type: "paragraph", content: `Body ${index}` }] },
  ));
  addPages(entries);
  return entries.length;
}

export function perfSeedFolder(childCount: number): PerfFixtureFolder {
  const folderId = `${FIXTURE_PREFIX}folder`;
  const folderTitle = "perf-folder";
  const folder = makeFixturePage(folderId, { title: folderTitle, content: [] });
  const children = Array.from({ length: childCount }, (_, index) => makeFixturePage(
    `${FIXTURE_PREFIX}file-${index}`,
    { title: `file-${String(index).padStart(4, "0")}.ts`, parentPageId: folderId, content: [] },
  ));
  addPages([folder, ...children]);
  return { folderId, folderTitle, childCount };
}

export function perfOpenCodePage(): string {
  const id = `${FIXTURE_PREFIX}code-${Date.now()}`;
  const page = makeFixturePage(id, { title: "perf.ts", surface: "code", content: [createCodeFileBlock("perf.ts", "const a = 1;\n")] });
  addPages([page]);
  usePageStore.getState().openPage({ id, workspaceId: page.workspaceId, kind: "page", title: page.title });
  return id;
}

if (isPerfEnabled()) {
  globalThis.__perfSeedPages = perfSeedPages;
  globalThis.__perfSeedFolder = perfSeedFolder;
  globalThis.__perfOpenCodePage = perfOpenCodePage;
  globalThis.__perfDurations = getPerfDurations;
  globalThis.__perfReset = resetPerfMetrics;
}
