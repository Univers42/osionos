/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-convos.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * Managing conversations: the Markdown export, the follow of the account across
 * browsers, the mirror of a rename and a delete, and the markup of the menu.
 *
 * The store reads "is a service configured" from the build's environment, which
 * a test cannot set for the store's own copy of the client; `setConversationApi`
 * is the seam, so the tests swap the API the store talks to.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChatMessage } from "@/features/chat/model/chatTypes";
import { setConversationApi } from "@/features/chat/model/conversationApi";
import { conversationMarkdown, markdownFileName } from "@/features/chat/model/conversationExport";
import { conversationsOf, useChatStore } from "@/features/chat/model/useChatStore";
import { useSummaryStore } from "@/features/chat/model/useSummaryStore";
import { useUserStore } from "@/features/auth";
import { ConversationMenu, DeleteConfirm } from "@/features/chat/ui/ConversationRow";

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};

/** A conversation of the service. */
function remote(id: string, title: string) {
  return { id, workspaceId: "w1", title, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z" };
}

/** An empty store, and the calls the fake API receives. */
function freshStore(overrides: Parameters<typeof setConversationApi>[0] = {}) {
  useChatStore.setState({ conversations: [], messages: [], activeConversationId: null });
  const calls: string[] = [];
  setConversationApi({
    isConfigured: () => true,
    rename: async (id, title) => { calls.push(`rename ${id} ${title}`); return remote(id, title); },
    remove: async (id) => { calls.push(`remove ${id}`); },
    ...overrides,
  });
  return calls;
}

test("conversationMarkdown: title, then each message under its speaker", () => {
  const message = (role: ChatMessage["role"], content: string): ChatMessage => ({
    id: content, conversationId: "c", role, content, createdAt: "2026-10-01T10:00:00Z",
  });
  const text = conversationMarkdown({ title: "Plan" }, [message("user", "Hi"), message("assistant", "Hello there")]);
  assert.equal(text, "# Plan\n\n**You:**\n\nHi\n\n**Assistant:**\n\nHello there\n");
  assert.equal(markdownFileName("Q3 plan: v2!"), "q3-plan-v2.md");
});

test("syncServerConversations adds the missing ones, keeps the local ones, and adds nothing twice", async () => {
  freshStore({ list: async () => [remote("s1", "From the account"), remote("s2", "Already here")] });
  const store = useChatStore.getState();
  const local = store.createConversation(null, { title: "Local only" });
  useChatStore.setState((s) => ({
    conversations: [...s.conversations, { id: "L2", projectId: null, title: "Already here", serverConversationId: "s2", createdAt: "x", updatedAt: "x" }],
  }));

  await store.syncServerConversations("w1");
  await store.syncServerConversations("w1");

  const titles = useChatStore.getState().conversations.map((c) => c.title).sort();
  assert.deepEqual(titles, ["Already here", "From the account", "Local only"]);
  const added = useChatStore.getState().conversations.find((c) => c.serverConversationId === "s1");
  assert.equal(added?.title, "From the account");
  assert.equal(useChatStore.getState().conversations.find((c) => c.id === local.id)?.title, "Local only");
});

test("a conversation shows only to the account that made it, on a browser shared by two", async () => {
  useUserStore.setState({ activeUserId: "user-a" });
  let release: () => void = () => undefined;
  const listed = new Promise<void>((resolve) => { release = resolve; });
  freshStore({ list: async () => { await listed; return [remote("sA", "A's from elsewhere")]; } });
  const mine = useChatStore.getState().createConversation(null, { title: "A local" });
  const sync = useChatStore.getState().syncServerConversations("w1");
  // The account switches while A's list is in flight: what arrives is still A's.
  useUserStore.setState({ activeUserId: "user-b" });
  release();
  await sync;
  const all = useChatStore.getState().conversations;
  assert.equal(mine.ownerId, "user-a");
  assert.equal(all.find((c) => c.serverConversationId === "sA")?.ownerId, "user-a");
  assert.deepEqual(conversationsOf(all, "user-b").map((c) => c.title), []);
  assert.deepEqual(conversationsOf(all, "user-a").map((c) => c.title).sort(), ["A local", "A's from elsewhere"]);
  // A conversation stored before owners were recorded stays visible to every account.
  const legacy = { id: "old", projectId: null, title: "Before owners", createdAt: "x", updatedAt: "x" };
  assert.deepEqual(conversationsOf([legacy], "user-b").map((c) => c.title), ["Before owners"]);
  useUserStore.setState({ activeUserId: "" });
});

test("a conversation from the service reads its transcript once, when it has no local message", async () => {
  let reads = 0;
  freshStore({
    list: async () => [remote("s9", "Remote")],
    transcript: async () => {
      reads += 1;
      return { summary: { text: "Earlier.", through: "2026-10-01T10:00:00Z" }, messages: [
        { id: "m1", conversationId: "s9", runId: "r1", role: "user", parts: [{ type: "text", text: "Hi" }], createdAt: "2026-10-01T10:00:00Z" },
        { id: "m2", conversationId: "s9", runId: "r1", role: "tool", parts: [{ type: "tool-result", toolCallId: "t", output: 1 }], createdAt: "2026-10-01T10:00:01Z" },
        { id: "m3", conversationId: "s9", runId: "r1", role: "assistant", parts: [{ type: "text", text: "Hello" }], createdAt: "2026-10-01T10:00:02Z" },
      ] };
    },
  });
  await useChatStore.getState().syncServerConversations("w1");
  const id = useChatStore.getState().conversations[0].id;
  await useChatStore.getState().loadServerTranscript(id);
  await useChatStore.getState().loadServerTranscript(id);
  assert.equal(reads, 1);
  const messages = useChatStore.getState().messagesFor(id);
  assert.deepEqual(messages.map((m) => [m.role, m.content]), [["user", "Hi"], ["assistant", "Hello"]]);
  assert.equal(useSummaryStore.getState().byConversation[id]?.summary?.text, "Earlier.");
});

test("rename and delete reach the service with the server id, and only when there is one", () => {
  const calls = freshStore();
  const store = useChatStore.getState();
  const synced = store.createConversation(null, { title: "Synced" });
  const local = store.createConversation(null, { title: "Local" });
  useChatStore.setState((s) => ({
    conversations: s.conversations.map((c) => (c.id === synced.id ? { ...c, serverConversationId: "srv-1" } : c)),
  }));

  store.renameConversation(synced.id, "Renamed");
  store.renameConversation(local.id, "Renamed local");
  store.deleteConversation(synced.id);
  store.deleteConversation(local.id);

  assert.deepEqual(calls, ["rename srv-1 Renamed", "remove srv-1"]);
  assert.equal(useChatStore.getState().conversations.length, 0);
});

test("a refused mirror leaves the local change and logs one warning", async () => {
  freshStore({ rename: async () => { throw new Error("503"); } });
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    const store = useChatStore.getState();
    const conversation = store.createConversation(null, { title: "Old" });
    useChatStore.setState((s) => ({ conversations: s.conversations.map((c) => ({ ...c, serverConversationId: "srv-2" })) }));
    store.renameConversation(conversation.id, "New");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(useChatStore.getState().conversations[0].title, "New");
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = original;
  }
});

test("without a service, nothing is mirrored and nothing is synced", async () => {
  const calls = freshStore({ isConfigured: () => false, list: async () => { calls.push("list"); return [remote("s1", "x")]; } });
  const store = useChatStore.getState();
  await store.syncServerConversations("w1");
  assert.equal(useChatStore.getState().conversations.length, 0);
  assert.deepEqual(calls, []);
});

test("the menu: real menu items, and the in-place confirmation", () => {
  const noop = () => undefined;
  const menu = renderToStaticMarkup(React.createElement(ConversationMenu, { onRename: noop, onExport: noop, onDelete: noop, onClose: noop }));
  assert.match(menu, /role="menu"/);
  assert.equal((menu.match(/role="menuitem"/g) ?? []).length, 3);
  for (const label of ["Rename", "Export as Markdown", "Delete"]) assert.ok(menu.includes(`>${label}</button>`), label);

  const confirm = renderToStaticMarkup(React.createElement(DeleteConfirm, { onConfirm: noop, onCancel: noop }));
  assert.ok(confirm.includes("Delete this conversation?"));
  assert.ok(confirm.includes(">Delete</button>") && confirm.includes(">Cancel</button>"));
});

test("the row: the More button carries its label, and the closed row has no menu", async () => {
  const { ConversationRow } = await import("@/features/chat/ui/ConversationRow");
  const row = renderToStaticMarkup(
    React.createElement(ConversationRow, {
      conversation: { id: "c", projectId: null, title: "T", createdAt: "x", updatedAt: "x" },
      onOpen: () => undefined,
      openClassName: "row",
      children: "T",
    }),
  );
  assert.ok(row.includes('aria-label="Conversation actions"'));
  assert.ok(!row.includes('role="menu"'));
});
