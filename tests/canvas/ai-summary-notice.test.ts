/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-summary-notice.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

// The earlier-messages notice: which one a thread shows, how the transcript's
// `summary` is read, the frame that feeds it, and the clear.

import assert from "node:assert/strict";
import test from "node:test";

import { setConversationApi } from "@/features/chat/model/conversationApi";
import { dispatchRunEvent, type RunEventActions } from "@/features/chat/model/runEventDispatch";
import { noticeOf, summaryFromBody, throughLabel, truncatedFromEvent } from "@/features/chat/model/summaryNotice";
import { entryOf, useSummaryStore } from "@/features/chat/model/useSummaryStore";

const SUMMARY = { text: "They planned a launch.", through: "2026-10-20T10:00:00Z" };

test("the notice table: every row", () => {
  assert.equal(noticeOf(SUMMARY, null), "summarised");
  assert.equal(noticeOf(SUMMARY, { summarized: false }), "summarised");
  assert.equal(noticeOf(null, { summarized: true }), "summarised");
  assert.equal(noticeOf(undefined, { summarized: true }), "summarised");
  assert.equal(noticeOf(null, { summarized: false }), "beyond");
  assert.equal(noticeOf(undefined, { summarized: false }), "beyond");
  assert.equal(noticeOf(null, null), "none");
});

test("key absent and no event is no notice", () => {
  assert.equal(noticeOf(undefined, null), "none");
});

test("the summary of a transcript: present, null, absent, malformed", () => {
  assert.deepEqual(summaryFromBody({ messages: [], summary: SUMMARY }), SUMMARY);
  assert.equal(summaryFromBody({ messages: [], summary: null }), null);
  assert.equal(summaryFromBody({ messages: [] }), undefined);
  assert.equal(summaryFromBody({ summary: "text" }), undefined);
  assert.equal(summaryFromBody({ summary: { text: 4, through: "x" } }), undefined);
  assert.equal(summaryFromBody({ summary: { text: "t" } }), undefined);
  assert.equal(summaryFromBody(null), undefined);
});

test("a context.truncated frame reaches the turn; a malformed one does not", () => {
  assert.deepEqual(truncatedFromEvent({ summarized: true }), { summarized: true });
  assert.equal(truncatedFromEvent({ summarized: "yes" }), null);
  const seen: unknown[] = [];
  const actions = { noteTruncated: (t: unknown) => void seen.push(t) } as unknown as RunEventActions;
  dispatchRunEvent("context.truncated", { summarized: false }, actions);
  dispatchRunEvent("context.truncated", {}, actions);
  assert.deepEqual(seen, [{ summarized: false }]);
});

test("the date of a summary is localised, and a non-date is shown as sent", () => {
  assert.notEqual(throughLabel(SUMMARY.through, "en-GB"), SUMMARY.through);
  assert.equal(throughLabel("last week"), "last week");
});

test("clear: the service is called, then the summary is null and the notice says beyond", async () => {
  const cleared: string[] = [];
  setConversationApi({ clearSummary: async (id) => void cleared.push(id) });
  useSummaryStore.setState({ byConversation: { c1: { summary: SUMMARY, truncated: { summarized: true } } } });
  await useSummaryStore.getState().clear("c1", "srv1");
  const entry = entryOf(useSummaryStore.getState(), "c1");
  assert.deepEqual(cleared, ["srv1"]);
  assert.equal(entry.summary, null);
  assert.equal(noticeOf(entry.summary, entry.truncated), "beyond");
});

test("a failed clear throws and keeps the summary", async () => {
  setConversationApi({ clearSummary: async () => { throw new Error("404"); } });
  useSummaryStore.setState({ byConversation: { c1: { summary: SUMMARY, truncated: null } } });
  await assert.rejects(useSummaryStore.getState().clear("c1", "srv1"));
  assert.deepEqual(entryOf(useSummaryStore.getState(), "c1").summary, SUMMARY);
});

test("refresh reads the summary from the transcript", async () => {
  setConversationApi({ transcript: async () => ({ messages: [], summary: SUMMARY }) });
  useSummaryStore.setState({ byConversation: { c1: { summary: undefined, truncated: { summarized: true } } } });
  await useSummaryStore.getState().refresh("c1", "srv1");
  assert.deepEqual(entryOf(useSummaryStore.getState(), "c1").summary, SUMMARY);
  setConversationApi();
});
