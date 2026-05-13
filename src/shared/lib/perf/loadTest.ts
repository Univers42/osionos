import type { Block } from "@/entities/block";
import type { ActivePage, PageEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import { derivePageState, flushScheduledPagesCachePersist, schedulePagesCachePersist } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import {
  diffEventCounts,
  getEventCountsSnapshot,
  getEventTimingDurations,
  getPerfDurations,
  getReactCommitDurations,
  getRenderCount,
  isPerfEnabled,
  mark,
  measure,
  resetPerfMetrics,
  startEventTimingCapture,
  usedJSHeapSize,
} from "./measure";

const PERF_PAGE_ID_PREFIX = "perf-page-";
const PERF_BLOCK_ID_PREFIX = "perf-block-";
const DEFAULT_SCENARIOS = [100, 500, 1000, 2000, 4000] as const;
const DEFAULT_KEYSTROKES = 200;
const DEFAULT_MEMORY_DELAY_MS = 300_000;
const TYPE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789 ";
const WORDS = [
  "alpha",
  "bridge",
  "canvas",
  "delta",
  "editor",
  "focus",
  "graph",
  "inline",
  "journal",
  "kernel",
  "layout",
  "matrix",
  "node",
  "origin",
  "pulse",
  "query",
  "render",
  "signal",
  "table",
  "update",
];

export interface PerfSeedResult {
  pageId: string;
  workspaceId: string;
  blockCount: number;
  typedBlockId: string;
}

export interface PerfTypeOptions {
  blockId?: string;
  intervalMs?: number;
}

export interface PerfEditorTypeOptions extends PerfTypeOptions {
  burst?: boolean;
}

export interface PerfTypeResult {
  blockId: string;
  keystrokes: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  eventTimingP50Ms: number | null;
  eventTimingP95Ms: number | null;
  eventTimingP99Ms: number | null;
  sidebarRenders: number;
  sidebarRendersPerKeystroke: number;
  eventCountsDelta: Record<string, number>;
}

export interface PerfEditorTypeResult extends PerfTypeResult {
  updatePageContentCalls: number;
  updatePageContentCallsPerKeystroke: number;
  updatePageContentMs: number;
  pageStoreActionCalls: number;
  pageStoreActionCallsPerKeystroke: number;
  maxPageStoreActionsPer250Ms: number;
}

export interface PerfRunOptions {
  scenarios?: number[];
  keystrokes?: number;
  intervalMs?: number;
  memoryDelayMs?: number;
}

export interface PerfRunRow {
  blockCount: number;
  pageId: string;
  firstPaintMs: number;
  keystrokes: number;
  keystrokeP50Ms: number;
  keystrokeP95Ms: number;
  keystrokeP99Ms: number;
  eventTimingP50Ms: number | null;
  eventTimingP95Ms: number | null;
  eventTimingP99Ms: number | null;
  updatePageContentMs: number;
  savePagesCacheMs: number;
  keystrokeSyncWorkMs: number;
  inlineMarkdownRenderCalls: number;
  inlineMarkdownRendersPerKeystroke: number;
  inlineMarkdownRenderMs: number;
  reactCommitCount: number;
  reactCommitsPerKeystroke: number;
  reactCommitTotalMs: number;
  reactCommitMaxMs: number;
  memoryUsedJSHeapSize: number | null;
  memoryGrowthBytes: number | null;
  sidebarRenders: number;
  sidebarRendersPerKeystroke: number;
  eventCountsDelta: Record<string, number>;
}

export interface PerfRunResult {
  rows: PerfRunRow[];
  csv: string;
}

declare global {
  var __perfSeed: ((blockCount: number) => PerfSeedResult) | undefined;
  var __perfSeedPage: ((blockCount: number) => PerfSeedResult) | undefined;
  var __perfType: ((keystrokes: number, options?: PerfTypeOptions) => Promise<PerfTypeResult>) | undefined;
  var __perfEditorType: ((keystrokes: number, options?: PerfEditorTypeOptions) => Promise<PerfEditorTypeResult>) | undefined;
  var __perfRun: ((options?: PerfRunOptions) => Promise<PerfRunResult>) | undefined;
}

let currentSeed: PerfSeedResult | null = null;

function perfNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function waitForPaint(): Promise<void> {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    return wait(0);
  }

  return new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => resolve());
    });
  });
}

function waitForNextFrameTimestamp(): Promise<number> {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    return wait(0).then(perfNow);
  }

  return new Promise((resolve) => {
    globalThis.requestAnimationFrame((timestamp) => resolve(timestamp));
  });
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createContent(index: number, rng: () => number): string {
  const length = 6 + Math.floor(rng() * 8);
  return Array.from({ length }, (_, wordIndex) => WORDS[(index + wordIndex + Math.floor(rng() * WORDS.length)) % WORDS.length]).join(" ");
}

function blockTypeForIndex(index: number): Block["type"] {
  if (index % 10 === 0) return "heading_2";
  if (index % 5 === 0) return "bulleted_list";
  return "paragraph";
}

function createBlocks(blockCount: number): Block[] {
  const rng = createRng(blockCount || 1);
  return Array.from({ length: blockCount }, (_, index) => ({
    id: `${PERF_BLOCK_ID_PREFIX}${blockCount}-${index}`,
    type: blockTypeForIndex(index),
    content: createContent(index, rng),
  }));
}

function resolvePerfWorkspace() {
  const userState = useUserStore.getState();
  const session = userState.activeSession();
  const activeWorkspace = userState.activeWorkspace();
  const workspaceId = activeWorkspace?._id ?? session?.privateWorkspaces[0]?._id ?? session?.sharedWorkspaces[0]?._id ?? "perf-workspace";

  return {
    workspaceId,
    ownerId: session?.userId ?? userState.activeUserId ?? null,
  };
}

function findBlockInTree(blocks: Block[], blockId: string): Block | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const child = block.children ? findBlockInTree(block.children, blockId) : null;
    if (child) return child;
  }
  return null;
}

function findBlockLocation(blockId: string): { pageId: string; block: Block } | null {
  const pagesByWorkspace = usePageStore.getState().pages;
  for (const pages of Object.values(pagesByWorkspace)) {
    for (const page of pages) {
      const block = findBlockInTree(page.content ?? [], blockId);
      if (block) return { pageId: page._id, block };
    }
  }
  return null;
}

function createPerfPage(pageId: string, workspaceId: string, ownerId: string | null): PageEntry {
  return {
    _id: pageId,
    title: `Perf ${pageId.replace(PERF_PAGE_ID_PREFIX, "")} blocks`,
    icon: "icon:activity",
    updatedAt: new Date().toISOString(),
    workspaceId,
    ownerId,
    visibility: "private",
    collaborators: [],
    parentPageId: null,
    databaseId: null,
    archivedAt: null,
    content: [],
    surface: "page",
  };
}

function insertPerfPage(page: PageEntry): ActivePage {
  const activePage: ActivePage = {
    id: page._id,
    workspaceId: page.workspaceId,
    kind: "page",
    title: page.title,
    icon: page.icon,
  };

  usePageStore.setState((state) => {
    const existingPages = state.pages[page.workspaceId] ?? [];
    return {
      ...derivePageState({
        ...state.pages,
        [page.workspaceId]: [
          page,
          ...existingPages.filter((existingPage) => !existingPage._id.startsWith(PERF_PAGE_ID_PREFIX)),
        ],
      }, state.pageIdsByWorkspace),
      showTrash: false,
      navigationPath: [],
    };
  });

  usePageStore.getState().openPage(activePage);
  if (usePageStore.getState().activePage?.id !== page._id) {
    usePageStore.setState({ activePage, showTrash: false, navigationPath: [] });
  }

  return activePage;
}

function ensurePerfContent(pageId: string, blocks: Block[]) {
  const page = usePageStore.getState().pageById(pageId);
  if ((page?.content?.length ?? 0) === blocks.length) return;

  usePageStore.setState((state) => {
    const pages = { ...state.pages };
    for (const workspaceId of Object.keys(pages)) {
      pages[workspaceId] = pages[workspaceId].map((entry) => (
        entry._id === pageId ? { ...entry, content: blocks } : entry
      ));
    }
    return derivePageState(pages, state.pageIdsByWorkspace);
  });
}

function seedPageWithBlocks(blockCount: number, blocks: Block[]): PerfSeedResult {
  const safeBlockCount = Math.max(1, Math.floor(blockCount));
  const { workspaceId, ownerId } = resolvePerfWorkspace();
  const pageId = `${PERF_PAGE_ID_PREFIX}${safeBlockCount}`;
  const page = createPerfPage(pageId, workspaceId, ownerId);
  insertPerfPage(page);
  usePageStore.getState().updatePageContent(pageId, blocks);
  ensurePerfContent(pageId, blocks);

  currentSeed = {
    pageId,
    workspaceId,
    blockCount: safeBlockCount,
    typedBlockId: blocks[0].id,
  };

  return currentSeed;
}

export function __perfSeed(blockCount: number): PerfSeedResult {
  const safeBlockCount = Math.max(1, Math.floor(blockCount));
  return seedPageWithBlocks(safeBlockCount, createBlocks(safeBlockCount));
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function max(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function maxEventsPerWindow(timestamps: number[], windowMs: number): number {
  let maxCount = 0;
  let left = 0;

  for (let right = 0; right < timestamps.length; right += 1) {
    while (timestamps[right] - timestamps[left] > windowMs) {
      left += 1;
    }
    maxCount = Math.max(maxCount, right - left + 1);
  }

  return maxCount;
}

function findEditorElement(blockId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(
    `[data-block-id="${blockId}"] [contenteditable="true"], [data-block-id="${blockId}"] textarea`,
  );
}

function insertEditorText(element: HTMLElement, text: string) {
  element.focus();

  if (element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    element.value = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
    element.selectionStart = element.selectionEnd = start + text.length;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    return;
  }

  const selection = globalThis.getSelection();
  if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    element.append(document.createTextNode(text));
  }
  element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
}

function eventCountsCell(value: Record<string, number>): string {
  return Object.entries(value)
    .map(([key, count]) => `${key}:${count}`)
    .join("|");
}

export async function __perfType(keystrokes: number, options: PerfTypeOptions = {}): Promise<PerfTypeResult> {
  const safeKeystrokes = Math.max(0, Math.floor(keystrokes));
  const safeIntervalMs = Math.max(0, options.intervalMs ?? 0);
  const blockId = options.blockId ?? currentSeed?.typedBlockId ?? __perfSeed(100).typedBlockId;
  const location = findBlockLocation(blockId);
  if (!location) {
    throw new Error(`[perf] Block not found: ${blockId}`);
  }

  startEventTimingCapture();
  const eventCountsBefore = getEventCountsSnapshot();
  const sidebarRendersBefore = getRenderCount("Sidebar");
  const latencies: number[] = [];
  let content = location.block.content ?? "";

  for (let index = 0; index < safeKeystrokes; index += 1) {
    await wait(0);
    const startMark = `perf:type:${index}:start`;
    mark(startMark);
    const startedAt = perfNow();
    content += TYPE_CHARS[index % TYPE_CHARS.length];
    usePageStore.getState().updateBlock(location.pageId, blockId, { content });
    const frameTimestamp = await waitForNextFrameTimestamp();
    latencies.push(frameTimestamp - startedAt);
    measure(`keystrokeLatency.${index}`, startMark);

    if (safeIntervalMs > 0 && index < safeKeystrokes - 1) {
      await wait(safeIntervalMs);
    }
  }

  const eventCountsDelta = diffEventCounts(eventCountsBefore, getEventCountsSnapshot());
  const sidebarRenders = getRenderCount("Sidebar") - sidebarRendersBefore;
  const eventTimings = getEventTimingDurations();

  return {
    blockId,
    keystrokes: safeKeystrokes,
    p50Ms: percentile(latencies, 50) ?? 0,
    p95Ms: percentile(latencies, 95) ?? 0,
    p99Ms: percentile(latencies, 99) ?? 0,
    eventTimingP50Ms: percentile(eventTimings, 50),
    eventTimingP95Ms: percentile(eventTimings, 95),
    eventTimingP99Ms: percentile(eventTimings, 99),
    sidebarRenders,
    sidebarRendersPerKeystroke: safeKeystrokes ? sidebarRenders / safeKeystrokes : 0,
    eventCountsDelta,
  };
}

export async function __perfEditorType(keystrokes: number, options: PerfEditorTypeOptions = {}): Promise<PerfEditorTypeResult> {
  const safeKeystrokes = Math.max(0, Math.floor(keystrokes));
  const safeIntervalMs = Math.max(0, options.intervalMs ?? 0);
  const blockId = options.blockId ?? currentSeed?.typedBlockId ?? __perfSeed(100).typedBlockId;
  const element = findEditorElement(blockId);
  if (!element) {
    throw new Error(`[perf] Editor element not found: ${blockId}`);
  }

  element.focus();
  await waitForPaint();

  startEventTimingCapture();
  const eventCountsBefore = getEventCountsSnapshot();
  const sidebarRendersBefore = getRenderCount("Sidebar");
  const updatePageContentCountBefore = getPerfDurations("updatePageContent").length;
  const pageStoreActionTimestamps: number[] = [];
  const pageStore = usePageStore.getState();
  const originalUpdatePageContent = pageStore.updatePageContent;
  const originalUpdateBlock = pageStore.updateBlock;
  const latencies: number[] = [];

  usePageStore.setState({
    updatePageContent: (pageId, blocks) => {
      pageStoreActionTimestamps.push(perfNow());
      originalUpdatePageContent(pageId, blocks);
    },
    updateBlock: (pageId, editedBlockId, updates) => {
      pageStoreActionTimestamps.push(perfNow());
      originalUpdateBlock(pageId, editedBlockId, updates);
    },
  });

  try {
    if (options.burst) {
      const startedAt = perfNow();
      for (let index = 0; index < safeKeystrokes; index += 1) {
        insertEditorText(element, TYPE_CHARS[index % TYPE_CHARS.length]);
      }
      const frameTimestamp = await waitForNextFrameTimestamp();
      latencies.push(frameTimestamp - startedAt);
    } else {
      for (let index = 0; index < safeKeystrokes; index += 1) {
        await wait(0);
        const startedAt = perfNow();
        insertEditorText(element, TYPE_CHARS[index % TYPE_CHARS.length]);
        const frameTimestamp = await waitForNextFrameTimestamp();
        latencies.push(frameTimestamp - startedAt);

        if (safeIntervalMs > 0 && index < safeKeystrokes - 1) {
          await wait(safeIntervalMs);
        }
      }
    }

    await wait(320);
    await waitForPaint();
  } finally {
    usePageStore.setState({
      updatePageContent: originalUpdatePageContent,
      updateBlock: originalUpdateBlock,
    });
  }

  const updatePageContentDurations = getPerfDurations("updatePageContent").slice(updatePageContentCountBefore);
  const eventCountsDelta = diffEventCounts(eventCountsBefore, getEventCountsSnapshot());
  const sidebarRenders = getRenderCount("Sidebar") - sidebarRendersBefore;
  const eventTimings = getEventTimingDurations();

  return {
    blockId,
    keystrokes: safeKeystrokes,
    p50Ms: percentile(latencies, 50) ?? 0,
    p95Ms: percentile(latencies, 95) ?? 0,
    p99Ms: percentile(latencies, 99) ?? 0,
    eventTimingP50Ms: percentile(eventTimings, 50),
    eventTimingP95Ms: percentile(eventTimings, 95),
    eventTimingP99Ms: percentile(eventTimings, 99),
    sidebarRenders,
    sidebarRendersPerKeystroke: safeKeystrokes ? sidebarRenders / safeKeystrokes : 0,
    eventCountsDelta,
    updatePageContentCalls: updatePageContentDurations.length,
    updatePageContentCallsPerKeystroke: safeKeystrokes ? updatePageContentDurations.length / safeKeystrokes : 0,
    updatePageContentMs: max(updatePageContentDurations),
    pageStoreActionCalls: pageStoreActionTimestamps.length,
    pageStoreActionCallsPerKeystroke: safeKeystrokes ? pageStoreActionTimestamps.length / safeKeystrokes : 0,
    maxPageStoreActionsPer250Ms: maxEventsPerWindow(pageStoreActionTimestamps, 250),
  };
}

function rowToCsv(row: PerfRunRow): string {
  return [
    row.blockCount,
    row.pageId,
    row.firstPaintMs.toFixed(2),
    row.keystrokes,
    row.keystrokeP50Ms.toFixed(2),
    row.keystrokeP95Ms.toFixed(2),
    row.keystrokeP99Ms.toFixed(2),
    row.eventTimingP50Ms?.toFixed(2) ?? "",
    row.eventTimingP95Ms?.toFixed(2) ?? "",
    row.eventTimingP99Ms?.toFixed(2) ?? "",
    row.updatePageContentMs.toFixed(2),
    row.savePagesCacheMs.toFixed(2),
    row.keystrokeSyncWorkMs.toFixed(2),
    row.inlineMarkdownRenderCalls,
    row.inlineMarkdownRendersPerKeystroke.toFixed(3),
    row.inlineMarkdownRenderMs.toFixed(2),
    row.reactCommitCount,
    row.reactCommitsPerKeystroke.toFixed(3),
    row.reactCommitTotalMs.toFixed(2),
    row.reactCommitMaxMs.toFixed(2),
    row.memoryUsedJSHeapSize ?? "",
    row.memoryGrowthBytes ?? "",
    row.sidebarRenders,
    row.sidebarRendersPerKeystroke.toFixed(3),
    eventCountsCell(row.eventCountsDelta),
  ].join(",");
}

function rowsToCsv(rows: PerfRunRow[]): string {
  const header = [
    "blockCount",
    "pageId",
    "firstPaintMs",
    "keystrokes",
    "keystrokeP50Ms",
    "keystrokeP95Ms",
    "keystrokeP99Ms",
    "eventTimingP50Ms",
    "eventTimingP95Ms",
    "eventTimingP99Ms",
    "updatePageContentMs",
    "savePagesCacheMs",
    "keystrokeSyncWorkMs",
    "inlineMarkdownRenderCalls",
    "inlineMarkdownRendersPerKeystroke",
    "inlineMarkdownRenderMs",
    "reactCommitCount",
    "reactCommitsPerKeystroke",
    "reactCommitTotalMs",
    "reactCommitMaxMs",
    "memoryUsedJSHeapSize",
    "memoryGrowthBytes",
    "sidebarRenders",
    "sidebarRendersPerKeystroke",
    "eventCountsDelta",
  ].join(",");
  return [header, ...rows.map(rowToCsv)].join("\n");
}

export async function __perfRun(options: PerfRunOptions = {}): Promise<PerfRunResult> {
  const scenarios = options.scenarios ?? [...DEFAULT_SCENARIOS];
  const keystrokes = options.keystrokes ?? DEFAULT_KEYSTROKES;
  const intervalMs = options.intervalMs ?? 0;
  const memoryDelayMs = options.memoryDelayMs ?? DEFAULT_MEMORY_DELAY_MS;
  const previousState = usePageStore.getState();
  const previousPages = previousState.pages;
  const previousPageRevisions = previousState.pageRevisions;
  const previousActivePage = previousState.activePage;
  const previousNavigationPath = previousState.navigationPath;
  const previousShowTrash = previousState.showTrash;
  const rows: PerfRunRow[] = [];

  try {
    for (const blockCount of scenarios) {
      const safeBlockCount = Math.max(1, Math.floor(blockCount));
      const blocks = createBlocks(safeBlockCount);
      resetPerfMetrics();
      startEventTimingCapture();

      const startMark = `perf:${safeBlockCount}:openPage:start`;
      mark(startMark);
      const seed = seedPageWithBlocks(safeBlockCount, blocks);
      await waitForPaint();
      const firstPaintMs = measure("firstPaint", startMark) ?? 0;

      const savePagesCacheCountBeforeTyping = getPerfDurations("savePagesCache").length;
      const inlineMarkdownCountBeforeTyping = getPerfDurations("renderInlineToReact").length;
      const memoryBeforeTyping = usedJSHeapSize();
      const typing = await __perfType(keystrokes, { blockId: seed.typedBlockId, intervalMs });
      const savePagesCacheDurations = getPerfDurations("savePagesCache").slice(savePagesCacheCountBeforeTyping);
      const inlineMarkdownDurations = getPerfDurations("renderInlineToReact").slice(inlineMarkdownCountBeforeTyping);

      if (memoryDelayMs > 0) {
        await wait(memoryDelayMs);
      }

      const memoryAfterDelay = usedJSHeapSize();
      const updatePageContentDurations = getPerfDurations("updatePageContent");
      const reactCommits = getReactCommitDurations();
      rows.push({
        blockCount: safeBlockCount,
        pageId: seed.pageId,
        firstPaintMs,
        keystrokes: typing.keystrokes,
        keystrokeP50Ms: typing.p50Ms,
        keystrokeP95Ms: typing.p95Ms,
        keystrokeP99Ms: typing.p99Ms,
        eventTimingP50Ms: typing.eventTimingP50Ms,
        eventTimingP95Ms: typing.eventTimingP95Ms,
        eventTimingP99Ms: typing.eventTimingP99Ms,
        updatePageContentMs: max(updatePageContentDurations),
        savePagesCacheMs: max(savePagesCacheDurations),
        keystrokeSyncWorkMs: max(savePagesCacheDurations),
        inlineMarkdownRenderCalls: inlineMarkdownDurations.length,
        inlineMarkdownRendersPerKeystroke: typing.keystrokes ? inlineMarkdownDurations.length / typing.keystrokes : 0,
        inlineMarkdownRenderMs: sum(inlineMarkdownDurations),
        reactCommitCount: reactCommits.length,
        reactCommitsPerKeystroke: typing.keystrokes ? reactCommits.length / typing.keystrokes : 0,
        reactCommitTotalMs: sum(reactCommits),
        reactCommitMaxMs: max(reactCommits),
        memoryUsedJSHeapSize: memoryAfterDelay,
        memoryGrowthBytes: memoryBeforeTyping !== null && memoryAfterDelay !== null
          ? memoryAfterDelay - memoryBeforeTyping
          : null,
        sidebarRenders: typing.sidebarRenders,
        sidebarRendersPerKeystroke: typing.sidebarRendersPerKeystroke,
        eventCountsDelta: typing.eventCountsDelta,
      });
      flushScheduledPagesCachePersist();
    }
  } finally {
    usePageStore.setState({
      ...derivePageState(previousPages),
      pageRevisions: previousPageRevisions,
      activePage: previousActivePage,
      navigationPath: previousNavigationPath,
      showTrash: previousShowTrash,
    });
    schedulePagesCachePersist(previousPages);
    flushScheduledPagesCachePersist();
  }

  const csv = rowsToCsv(rows);
  console.info(`[perf] baseline CSV\n${csv}`);
  return { rows, csv };
}

function installPerfLoadTestGlobals() {
  if (!isPerfEnabled()) return;

  globalThis.__perfSeed = __perfSeed;
  globalThis.__perfSeedPage = __perfSeed;
  globalThis.__perfType = __perfType;
  globalThis.__perfEditorType = __perfEditorType;
  globalThis.__perfRun = __perfRun;
}

installPerfLoadTestGlobals();