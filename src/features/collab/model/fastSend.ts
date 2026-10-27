/**
 * Draft-tap fast send: turns a block-draft event into one realtime-only `put`
 * so a peer sees a keystroke without waiting for the 250 ms idle commit (the
 * persistence PATCH timing is untouched — this path never writes the store).
 *
 * The put is built with diffBlocks over the page tree (draft text swapped into
 * the block), so its payload is byte-identical to the one the commit path
 * would send later. `lastSent` is the text peers hold for each block; when the
 * draft settles (idle commit, undo, cancel) on different text, one corrective
 * put restores it, otherwise a peer would keep text the author never committed.
 *
 * Puts for one block are throttled to one per MIN_GAP_MS, trailing edge carrying
 * the latest draft: a keystroke after a quiet gap still leaves at once, a burst
 * (paste, key repeat, a 208-char type with no delay) sends ~30 puts a second instead
 * of one per character. Unthrottled, that burst landed on peers 847 ms after the
 * last key, live 2026-10-27 (rtmulti 83507), against 99 ms p50 for normal typing.
 *
 * Caveat: whole-block last-write-wins, as everywhere in blockSync — two people
 * typing in the SAME block still lose characters, and a peer's focused-block
 * hold delays remote text up to 1.5 s. Fixing that needs a text CRDT.
 */

import { updateBlockInTree } from '@/entities/block/model/blockTreeUtils';
import type { Block } from '@/entities/block';
import { diffBlocks, type BlockDiffOp } from './blockSync';

/** Structural copy of blockDraftStore's DraftTapEvent (model must not import the editor feature). */
export interface DraftTap {
  kind: 'draft' | 'settled';
  sourceKey: string;
  blockId: string;
  /** Draft text, or the final committed text; null when the store cannot say (cancel). */
  content: string | null;
}

export interface FastSender {
  onTap(tap: DraftTap): void;
  /** Cancel pending trailing puts (the page is being left). */
  dispose(): void;
}

interface FastSenderDeps {
  pageId: string;
  readContent(): Block[] | undefined;
  /** Stamp, record and broadcast the ops (same path as the diff flush). */
  emit(ops: BlockDiffOp[]): void;
  markLocalEdit(blockId: string): void;
  /** Throttle gap per block; 0 sends every draft. Defaults to MIN_GAP_MS. */
  minGapMs?: number;
  now?: () => number;
}

/** ~30 puts a second per block: under a human's inter-key gap, so typing is never delayed. */
export const MIN_GAP_MS = 33;

interface Throttle { lastAt: number; timer: ReturnType<typeof setTimeout> | null; text: string | null }

function withText(tree: Block[], blockId: string, text: string): Block[] {
  return updateBlockInTree(tree, blockId, (block) => (block.content === text ? block : { ...block, content: text }));
}

function textOf(tree: Block[], blockId: string): string | null {
  let found: string | null = null;
  updateBlockInTree(tree, blockId, (block) => { found = block.content; return block; });
  return found;
}

export function createFastSender(deps: FastSenderDeps): FastSender {
  const sourceKey = `page:${deps.pageId}`.toLowerCase();
  const lastSent = new Map<string, string>();
  const throttles = new Map<string, Throttle>();
  const gap = deps.minGapMs ?? MIN_GAP_MS;
  const now = deps.now ?? (() => performance.now());

  // Diffed against what peers hold (lastSent), not the document, so text that
  // returns to the document's own value still reaches peers as a correction.
  const send = (blockId: string, tree: Block[], text: string): void => {
    const sent = lastSent.get(blockId);
    const from = sent === undefined ? tree : withText(tree, blockId, sent);
    const ops = diffBlocks(from, withText(tree, blockId, text));
    if (ops.length === 0) return;
    lastSent.set(blockId, text);
    deps.emit(ops);
  };

  // The trailing send re-reads the tree: the page may have changed during the gap.
  const flushTrailing = (blockId: string): void => {
    const state = throttles.get(blockId);
    if (!state || state.text === null) return;
    const text = state.text;
    state.text = null;
    state.timer = null;
    state.lastAt = now();
    const tree = deps.readContent();
    if (tree && textOf(tree, blockId) !== null) send(blockId, tree, text);
  };

  const sendThrottled = (blockId: string, tree: Block[], text: string): void => {
    const state = throttles.get(blockId) ?? { lastAt: -Infinity, timer: null, text: null };
    throttles.set(blockId, state);
    const wait = state.lastAt + gap - now();
    if (state.timer === null && wait <= 0) {
      state.lastAt = now();
      send(blockId, tree, text);
      return;
    }
    state.text = text;
    state.timer ??= setTimeout(() => flushTrailing(blockId), Math.max(0, wait));
  };

  // Settle supersedes a pending trailing put: the final text goes out below.
  const dropThrottle = (blockId: string): void => {
    const state = throttles.get(blockId);
    if (state?.timer) clearTimeout(state.timer);
    throttles.delete(blockId);
  };

  return {
    onTap(tap) {
      if (tap.sourceKey.toLowerCase() !== sourceKey) return;
      const tree = deps.readContent();
      if (!tree || textOf(tree, tap.blockId) === null) return;
      if (tap.kind === 'draft') {
        deps.markLocalEdit(tap.blockId);
        if (tap.content === null) return;
        sendThrottled(tap.blockId, tree, tap.content);
        return;
      }
      dropThrottle(tap.blockId);
      const sent = lastSent.get(tap.blockId);
      const final = tap.content ?? textOf(tree, tap.blockId);
      if (sent !== undefined && final !== null && sent !== final) send(tap.blockId, tree, final);
      lastSent.delete(tap.blockId);
    },
    dispose() {
      for (const blockId of [...throttles.keys()]) dropThrottle(blockId);
    },
  };
}
