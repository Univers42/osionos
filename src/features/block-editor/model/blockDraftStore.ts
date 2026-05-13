import { useCallback, useSyncExternalStore } from "react";

export type BlockDraftCommitReason =
  | "idle"
  | "blur"
  | "structural"
  | "shortcut"
  | "unmount"
  | "undo-redo";

type DraftCommitter = (
  blockId: string,
  content: string,
  reason: BlockDraftCommitReason,
) => void;
type DraftListener = () => void;

interface DraftEntry {
  baseContent: string;
  draftContent: string;
  dirty: boolean;
  idleTimer: ReturnType<typeof globalThis.setTimeout> | null;
}

const IDLE_COMMIT_DELAY_MS = 250;
const draftEntries = new Map<string, DraftEntry>();
const draftListeners = new Map<string, Set<DraftListener>>();
const draftCommitters = new Map<string, DraftCommitter>();

function draftKey(sourceKey: string, blockId: string): string {
  return `${sourceKey}\u0000${blockId}`;
}

function isSourceDraftKey(key: string, sourceKey: string): boolean {
  return key.startsWith(`${sourceKey}\u0000`);
}

function blockIdFromDraftKey(key: string): string {
  return key.slice(key.indexOf("\u0000") + 1);
}

function clearIdleTimer(entry: DraftEntry) {
  if (entry.idleTimer === null) return;
  globalThis.clearTimeout(entry.idleTimer);
  entry.idleTimer = null;
}

function notifyDraftKey(key: string) {
  draftListeners.get(key)?.forEach((listener) => listener());
}

function getOrCreateEntry(sourceKey: string, blockId: string, committedContent: string): DraftEntry {
  const key = draftKey(sourceKey, blockId);
  const existing = draftEntries.get(key);
  if (existing) return existing;

  const entry: DraftEntry = {
    baseContent: committedContent,
    draftContent: committedContent,
    dirty: false,
    idleTimer: null,
  };
  draftEntries.set(key, entry);
  return entry;
}

function subscribeToDraft(sourceKey: string, blockId: string, listener: DraftListener): () => void {
  const key = draftKey(sourceKey, blockId);
  const listeners = draftListeners.get(key) ?? new Set<DraftListener>();
  listeners.add(listener);
  draftListeners.set(key, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) draftListeners.delete(key);
  };
}

function getDraftSnapshot(sourceKey: string, blockId: string, committedContent: string): string {
  const entry = draftEntries.get(draftKey(sourceKey, blockId));
  if (!entry) return committedContent;
  if (!entry.dirty && entry.baseContent !== committedContent) return committedContent;
  return entry.draftContent;
}

function scheduleIdleCommit(sourceKey: string, blockId: string, entry: DraftEntry) {
  clearIdleTimer(entry);
  if (!entry.dirty) return;

  entry.idleTimer = globalThis.setTimeout(() => {
    entry.idleTimer = null;
    commitBlockDraft(sourceKey, blockId, "idle");
  }, IDLE_COMMIT_DELAY_MS);
}

export function setBlockDraftCommitter(sourceKey: string, committer: DraftCommitter): () => void {
  draftCommitters.set(sourceKey, committer);
  return () => {
    if (draftCommitters.get(sourceKey) === committer) {
      draftCommitters.delete(sourceKey);
    }
  };
}

export function setBlockDraft(
  sourceKey: string,
  blockId: string,
  committedContent: string,
  draftContent: string,
) {
  const key = draftKey(sourceKey, blockId);
  const entry = getOrCreateEntry(sourceKey, blockId, committedContent);

  if (!entry.dirty && entry.baseContent !== committedContent) {
    entry.baseContent = committedContent;
    entry.draftContent = committedContent;
  }

  if (entry.draftContent === draftContent && entry.dirty === (draftContent !== entry.baseContent)) {
    scheduleIdleCommit(sourceKey, blockId, entry);
    return;
  }

  entry.draftContent = draftContent;
  entry.dirty = draftContent !== entry.baseContent;
  scheduleIdleCommit(sourceKey, blockId, entry);
  notifyDraftKey(key);
}

export function commitBlockDraft(
  sourceKey: string,
  blockId: string,
  reason: BlockDraftCommitReason,
): boolean {
  const key = draftKey(sourceKey, blockId);
  const entry = draftEntries.get(key);
  if (!entry?.dirty) return false;

  clearIdleTimer(entry);
  const nextContent = entry.draftContent;
  const committer = draftCommitters.get(sourceKey);
  if (!committer) return false;

  entry.baseContent = nextContent;
  entry.dirty = false;
  committer(blockId, nextContent, reason);
  notifyDraftKey(key);
  return true;
}

export function flushBlockDraft(
  sourceKey: string,
  blockId: string,
  reason: BlockDraftCommitReason,
): boolean {
  return commitBlockDraft(sourceKey, blockId, reason);
}

export function flushAllBlockDraftsForSource(
  sourceKey: string,
  reason: BlockDraftCommitReason,
): boolean {
  let committed = false;
  const keys = Array.from(draftEntries.keys());
  for (const key of keys) {
    if (!isSourceDraftKey(key, sourceKey)) continue;
    committed = commitBlockDraft(sourceKey, blockIdFromDraftKey(key), reason) || committed;
  }
  return committed;
}

export function rebaseBlockDraft(sourceKey: string, blockId: string, committedContent: string) {
  const key = draftKey(sourceKey, blockId);
  const entry = draftEntries.get(key);
  if (!entry) return;

  clearIdleTimer(entry);
  entry.baseContent = committedContent;
  entry.draftContent = committedContent;
  entry.dirty = false;
  notifyDraftKey(key);
}

export function clearBlockDraft(sourceKey: string, blockId: string) {
  const key = draftKey(sourceKey, blockId);
  const entry = draftEntries.get(key);
  if (entry) clearIdleTimer(entry);
  draftEntries.delete(key);
  notifyDraftKey(key);
}

export function clearBlockDraftsForSource(sourceKey: string) {
  const keys = Array.from(draftEntries.keys());
  for (const key of keys) {
    if (!isSourceDraftKey(key, sourceKey)) continue;
    const entry = draftEntries.get(key);
    if (entry) clearIdleTimer(entry);
    draftEntries.delete(key);
    notifyDraftKey(key);
  }
}

export function useBlockDraftContent(
  sourceKey: string,
  blockId: string,
  committedContent: string,
): string {
  const subscribe = useCallback(
    (listener: DraftListener) => subscribeToDraft(sourceKey, blockId, listener),
    [blockId, sourceKey],
  );
  const getSnapshot = useCallback(
    () => getDraftSnapshot(sourceKey, blockId, committedContent),
    [blockId, committedContent, sourceKey],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}