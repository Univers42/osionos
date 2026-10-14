/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   queued-input.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { flushQueuedInput, queueInputFlush } from "@/shared/lib/editor-input/queuedInput";
import {
  clearBlockDraftsForSource,
  flushAllBlockDraftsForSource,
  setBlockDraft,
  setBlockDraftCommitter,
} from "@/features/block-editor/model/blockDraftStore";

test("a released flush never runs; a flush that queues again runs once per drain", () => {
  const calls: string[] = [];
  const release = queueInputFlush(() => calls.push("released"));
  release();
  let releaseRequeued = () => {};
  const flush = () => {
    calls.push("requeue");
    releaseRequeued();
    releaseRequeued = queueInputFlush(flush);
  };
  releaseRequeued = queueInputFlush(flush);
  flushQueuedInput();
  assert.deepEqual(calls, ["requeue"]);
  releaseRequeued();
  flushQueuedInput();
  assert.deepEqual(calls, ["requeue"]);
});

test("a draft commit emits a keystroke batch still waiting for its frame first", () => {
  const source = "queued-input-test";
  const committed: string[] = [];
  const stopCommitting = setBlockDraftCommitter(source, (_blockId, content) => committed.push(content));
  setBlockDraft(source, "b1", "", "/quot");
  // The editable's frame batch: "e" typed in the same frame as the Enter the menu took.
  const release = queueInputFlush(() => {
    release();
    setBlockDraft(source, "b1", "", "/quote");
  });

  flushAllBlockDraftsForSource(source, "shortcut");

  assert.deepEqual(committed, ["/quote"]);
  stopCommitting();
  clearBlockDraftsForSource(source);
});
