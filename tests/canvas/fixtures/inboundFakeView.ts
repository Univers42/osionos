/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundFakeView.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An in-memory InboundView over a flat page table, the executor's side effects
// (`applySteps`), and the event/step builders both inbound-plan test files share.
// Test-only: every lookup is a linear scan rebuilt per call — the case-insensitive
// `caseOf` half of entryAt included — so a `move` never leaves a stale index.

import assert from "node:assert/strict";

import { planInbound } from "../../../src/features/ide/model/inboundPlan.ts";
import type {
  DirRole, InboundEvent, InboundStep, InboundView, LivePage, MoveEvidence, ViewEntry,
} from "../../../src/features/ide/model/inboundPlan.ts";

/** A page file as the app writes it; `copyText` is the same file minus its id line. */
export const pageText = (id: string, body = ""): string => `---\nid: ${JSON.stringify(id)}\ntitle: "T"\n---\n${body}`;
export const copyText = (body = ""): string => `---\ntitle: "T"\n---\n${body}`;
export const write = (path: string, hash: string, text: string): InboundEvent => ({ kind: "write", path, hash, text });
export const drop = (path: string): InboundEvent => ({ kind: "delete", path });

export const loud = (reason: string): InboundStep => ({ op: "skip", reason, quiet: false });
export const temp = (path: string, quiet: boolean): InboundStep =>
  ({ op: "skip", reason: `${path} looks like an editor temp file; not synced`, quiet });
export const readOnly = (path: string): InboundStep =>
  loud(`${path}: read-only for you; the page stays and the file returns on the next attach`);
export const noFolder = (path: string): InboundStep =>
  loud(`${path}: no folder here; create the folder from the app or with a page inside it`);
export const record = (path: string, hash: string): InboundStep => ({ op: "record", path, hash });
export const cancel = (pageId: string): InboundStep => ({ op: "cancel-archive", pageId });
export const schedule = (pageId: string, path: string): InboundStep => ({ op: "schedule-archive", pageId, path });
export const deletedDir = (path: string, role: DirRole, ownerId: string): InboundStep => ({ op: "deleted-dir", path, role, ownerId });
export const move = (pageId: string, fromPath: string, toPath: string, dir = false): InboundStep =>
  ({ op: "move", pageId, fromPath, toPath, dir });
export const apply = (pageId: string, path: string, text: string, hash: string): InboundStep => ({ op: "apply", pageId, path, text, hash });
export const conflict = (pageId: string, path: string, theirs: string, hash: string): InboundStep =>
  ({ op: "conflict", pageId, path, theirs, hash });
export const copy = (path: string, hash: string, body = ""): InboundStep => ({ op: "create", path, text: copyText(body), hash, kind: "page" });

/** The exact step list ONE event plans (nothing applied). */
export async function expectPlan(view: FakeView, event: InboundEvent, steps: readonly InboundStep[], message?: string): Promise<void> {
  assert.deepStrictEqual(await planInbound(event, view), steps, message);
}

/** One page: `path` is its workspace path (a folder's is its own directory). */
export interface FakePage {
  readonly pageId: string; readonly isFolder: boolean; readonly isCode: boolean; readonly parentId: string | undefined;
  path: string; filePath: string; archived: boolean; text: string;
}

export interface FakeTable {
  readonly pages: FakePage[]; readonly pending: Set<string>; readonly ledger: Map<string, string>;
  readonly deletedDirs: { path: string; role: DirRole; ownerId: string }[];
  readonly echo: Set<string>; readonly noDelete: Set<string>;
  readonly inboundArchived: Map<string, { syncedHash: string | null; path: string }>;
}

export type FakeView = InboundView & { readonly table: FakeTable };

/** `text` is what localText returns, `synced` the ledger at the page's own
 *  file, `echoHash` joins the echo set, `inboundArchive` = archived by THIS flow. */
export interface FakePageSpec {
  id: string; path: string; folder?: boolean; code?: boolean; parentId?: string; archived?: boolean;
  text?: string; synced?: string; echoHash?: string; canDelete?: false;
  inboundArchive?: { syncedHash: string | null; path: string };
}

const fileOf = (path: string, isFolder: boolean): string => (isFolder ? `${path}/_folder.omd` : path);
/** A code page's children live in `<file>.d`, a page file's in `<name>` minus `.omd`. */
const childrenDirOf = (path: string, isCode: boolean): string => (isCode ? `${path}.d` : path.replace(/\.omd$/, ""));
const pageOf = (table: FakeTable, pageId: string): FakePage | undefined => table.pages.find((row) => row.pageId === pageId);

export function viewOf(specs: readonly FakePageSpec[]): FakeView {
  const table: FakeTable = { pages: [], pending: new Set(), deletedDirs: [], ledger: new Map(),
    echo: new Set(), noDelete: new Set(), inboundArchived: new Map() };
  for (const spec of specs) addPage(table, spec);
  return {
    table,
    entryAt: (segments) => entryAt(table, segments.join("/")),
    pageState: (pageId) => pageState(pageOf(table, pageId)),
    hasOwnPending: (pageId) => table.pending.has(pageId),
    moveEvidence: (pageId) => moveEvidence(table, pageId),
    archivedByInbound: (pageId) => table.inboundArchived.get(pageId),
    canDelete: (pageId) => !table.noDelete.has(pageId),
    syncedHashOf: (path) => table.ledger.get(path) ?? null,
    isEchoHash: (hash) => table.echo.has(hash),
    childrenOf: (entryId) => table.pages.filter((page) => !page.archived && page.parentId === entryId.replace(/#dir$/, ""))
      .map((page) => ({ pageId: page.pageId, path: page.path })),
    localText: (pageId) => Promise.resolve(pageOf(table, pageId)?.text ?? ""),
    pendingDeletedDirs: () => table.deletedDirs.map((dir) => ({ dir: dir.path, role: dir.role, ownerId: dir.ownerId })),
  };
}

function addPage(table: FakeTable, spec: FakePageSpec): void {
  const isFolder = spec.folder === true;
  const filePath = fileOf(spec.path, isFolder);
  table.pages.push({ pageId: spec.id, path: spec.path, filePath, isFolder, isCode: spec.code === true,
    parentId: spec.parentId, archived: spec.archived === true, text: spec.text ?? "" });
  if (spec.synced !== undefined) table.ledger.set(filePath, spec.synced);
  if (spec.echoHash !== undefined) table.echo.add(spec.echoHash);
  if (spec.canDelete === false) table.noDelete.add(spec.id);
  if (spec.inboundArchive !== undefined) table.inboundArchived.set(spec.id, spec.inboundArchive);
}

/** Every live page's file, plus its folder directory or (when it has children) its children directory. */
function entriesOf(table: FakeTable): ViewEntry[] {
  const owners = new Set(table.pages.map((row) => row.parentId));
  const out: ViewEntry[] = [];
  for (const page of table.pages.filter((row) => !row.archived)) {
    const role = page.isFolder ? "folder-meta" : page.isCode ? "code-file" : "page-file";
    out.push({ entryId: page.pageId, pageId: page.pageId, path: page.filePath, role });
    if (page.isFolder) out.push({ entryId: page.pageId, pageId: page.pageId, path: page.path, role: "folder-dir" });
    else if (owners.has(page.pageId)) out.push({ entryId: `${page.pageId}#dir`, pageId: page.pageId, role: "children-dir",
      path: childrenDirOf(page.path, page.isCode) });
  }
  return out;
}

function entryAt(table: FakeTable, wanted: string): ViewEntry | { caseOf: ViewEntry } | undefined {
  const entries = entriesOf(table);
  const exact = entries.find((entry) => entry.path === wanted);
  if (exact !== undefined) return exact;
  const folded = entries.find((entry) => entry.path.toLowerCase() === wanted.toLowerCase());
  return folded === undefined ? undefined : { caseOf: folded };
}

function pageState(page: FakePage | undefined): LivePage | { status: "archived" } | undefined {
  if (page === undefined) return undefined;
  if (page.archived) return { status: "archived" };
  return { status: "live", path: page.path, filePath: page.filePath, isFolder: page.isFolder, parentId: page.parentId };
}

/** "own" first; else the DEEPEST registered deleted directory covering the page's file. */
function moveEvidence(table: FakeTable, pageId: string): MoveEvidence | undefined {
  if (table.pending.has(pageId)) return { kind: "own" };
  const page = pageOf(table, pageId);
  if (page === undefined || page.archived) return undefined;
  const covering = table.deletedDirs.filter((dir) => page.filePath.startsWith(`${dir.path}/`));
  const deepest = covering.sort((left, right) => right.path.length - left.path.length)[0];
  return deepest === undefined ? undefined : { kind: "dir", dir: deepest.path, role: deepest.role, ownerId: deepest.ownerId };
}

/**
 * The executor's side effects, in order. Ponytail: the ledger does NOT follow a
 * `move` (clearing or moving it is the executor's B2 upkeep), so a later write at
 * a moved page's new path is decided against `null` — a test that edits a moved
 * file sees a conflict the real executor would not.
 */
export function applySteps(view: FakeView, steps: readonly InboundStep[]): void {
  for (const step of steps) applyStep(view.table, step);
}

function applyStep(table: FakeTable, step: InboundStep): void {
  const page = "pageId" in step ? pageOf(table, step.pageId) : undefined;
  if (step.op === "schedule-archive") table.pending.add(step.pageId);
  else if (step.op === "cancel-archive") table.pending.delete(step.pageId);
  else if (step.op === "deleted-dir") table.deletedDirs.push({ path: step.path, role: step.role, ownerId: step.ownerId });
  else if (step.op === "record") table.ledger.set(step.path, step.hash);
  else if (step.op === "move") movePages(table, step);
  else if (step.op === "restore" && page !== undefined) { page.archived = false; table.inboundArchived.delete(step.pageId); }
  else if (step.op === "apply" && page !== undefined) { page.text = step.text; table.ledger.set(step.path, step.hash); }
  else if (step.op === "create") table.pages.push({ pageId: `fresh-${table.pages.length}`, path: step.path, filePath: step.path,
    isFolder: false, isCode: step.kind === "code", parentId: undefined, archived: false, text: step.text });
}

/** A page's children directory travels with it: a folder move shifts everything
 *  under its directory, a page move everything under its children directory. */
function movePages(table: FakeTable, step: Extract<InboundStep, { op: "move" }>): void {
  const moved = pageOf(table, step.pageId);
  if (moved === undefined || moved.path !== step.fromPath || moved.isFolder !== step.dir) {
    throw new Error(`move ${step.pageId}: fromPath/dir do not describe the page as it is`);
  }
  const from = moved.isFolder ? moved.path : childrenDirOf(moved.path, moved.isCode);
  const to = moved.isFolder ? step.toPath : childrenDirOf(step.toPath, moved.isCode);
  const rePath = (page: FakePage, path: string): void => { page.path = path; page.filePath = fileOf(path, page.isFolder); };
  rePath(moved, step.toPath);
  for (const page of table.pages) {
    if (page !== moved && page.path.startsWith(`${from}/`)) rePath(page, to + page.path.slice(from.length));
  }
}

/** Run a shell command's events in order, letting each one change the world. */
export async function replay(view: FakeView, events: readonly InboundEvent[]): Promise<InboundStep[][]> {
  const batches: InboundStep[][] = [];
  for (const event of events) {
    batches.push(await planInbound(event, view));
    applySteps(view, batches[batches.length - 1]);
  }
  return batches;
}
