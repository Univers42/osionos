/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConversationRow.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import type { Conversation } from "../model/chatTypes";
import { conversationMarkdown, downloadMarkdown, markdownFileName } from "../model/conversationExport";
import { useChatStore } from "../model/useChatStore";

/**
 * A conversation in a list: the row that opens it, and the "More" menu to
 * rename, export or delete it. Both lists (the rail panel and the assistant
 * shell) draw their rows with this one, so the two cannot drift.
 */

const itemClass =
  "flex w-full items-center rounded-sm px-2 py-1 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] focus-visible:bg-[var(--osio-bg-hover)] focus-visible:outline-none";

/** The menu of a row. `onClose` is called after an item ran, and on Escape. */
export const ConversationMenu: React.FC<{
  onRename: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ onRename, onExport, onDelete, onClose }) => {
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  // The menu opens on its first item, so the arrows work at once.
  useEffect(() => { items.current[0]?.focus(); }, []);

  const move = (event: React.KeyboardEvent, from: number) => {
    const count = items.current.length;
    if (event.key === "ArrowDown") items.current[(from + 1) % count]?.focus();
    else if (event.key === "ArrowUp") items.current[(from - 1 + count) % count]?.focus();
    else if (event.key === "Escape") onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const entries: Array<[string, () => void]> = [["Rename", onRename], ["Export as Markdown", onExport], ["Delete", onDelete]];
  return (
    <div
      role="menu"
      aria-label="Conversation actions"
      className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1 shadow-osio-e3"
    >
      {entries.map(([label, run], index) => (
        <button
          key={label}
          ref={(node) => { items.current[index] = node; }}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={itemClass}
          onKeyDown={(event) => move(event, index)}
          onClick={run}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

/** The question that replaces a row being deleted. No `window.confirm`: the page owns the dialog. */
export const DeleteConfirm: React.FC<{ onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => (
  <div
    role="group"
    aria-label="Delete this conversation?"
    className="flex flex-wrap items-center gap-2 px-2 py-1 text-sm text-[var(--osio-fg-default)]"
    onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
  >
    <span>Delete this conversation?</span>
    <button type="button" onClick={onConfirm}
      className="rounded-sm bg-[var(--osio-danger)] px-2 py-0.5 text-[var(--osio-danger-fg)] hover:bg-[var(--osio-danger-hover)] focus-visible:outline-none focus-visible:ring-offset-1 focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]">
      Delete
    </button>
    <button type="button" onClick={onCancel} autoFocus
      className="rounded-sm px-2 py-0.5 hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]">
      Cancel
    </button>
  </div>
);

/** The inline title input: Enter saves, Escape cancels, an empty title keeps the old one. */
const RenameInput: React.FC<{ title: string; onSave: (title: string) => void; onCancel: () => void }> = ({ title, onSave, onCancel }) => {
  const [value, setValue] = useState(title);
  const done = useRef(false);
  const finish = (save: boolean) => {
    // Enter then the blur it causes must save once.
    if (done.current) return;
    done.current = true;
    if (save && value.trim()) onSave(value.trim());
    else onCancel();
  };
  return (
    <input
      autoFocus
      aria-label="Conversation title"
      value={value}
      maxLength={200}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
      }}
      className="min-w-0 flex-1 rounded-sm border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm text-[var(--osio-fg-default)] outline-none focus:ring-2 focus:ring-[var(--osio-focus-ring-color)]"
    />
  );
};

/** Exports the conversation as a `.md` download; a conversation from the service reads its transcript first. */
async function exportConversation(conversation: Conversation): Promise<void> {
  const store = useChatStore.getState();
  await store.loadServerTranscript(conversation.id);
  const messages = useChatStore.getState().messagesFor(conversation.id);
  downloadMarkdown(markdownFileName(conversation.title), conversationMarkdown(conversation, messages));
}

type Mode = "idle" | "menu" | "rename" | "delete";

export const ConversationRow: React.FC<{
  conversation: Conversation;
  /** What the open button holds: icon and title. */
  children: React.ReactNode;
  onOpen: () => void;
  /** The classes of the open button, so each list keeps its own look. */
  openClassName: string;
  isCurrent?: boolean;
}> = ({ conversation, children, onOpen, openClassName, isCurrent }) => {
  const [mode, setMode] = useState<Mode>("idle");
  const moreButton = useRef<HTMLButtonElement>(null);
  const rename = useChatStore((s) => s.renameConversation);
  const remove = useChatStore((s) => s.deleteConversation);

  const closeMenu = () => {
    setMode("idle");
    moreButton.current?.focus();
  };

  if (mode === "rename") {
    return (
      <div className="flex items-center px-1 py-0.5">
        <RenameInput
          title={conversation.title}
          onSave={(title) => { rename(conversation.id, title); setMode("idle"); }}
          onCancel={() => setMode("idle")}
        />
      </div>
    );
  }
  if (mode === "delete") {
    return <DeleteConfirm onConfirm={() => remove(conversation.id)} onCancel={() => setMode("idle")} />;
  }

  return (
    <div
      className="group relative flex items-center"
      onBlur={(event) => {
        // Focus left the row: the menu closes without stealing it back.
        if (mode === "menu" && !event.currentTarget.contains(event.relatedTarget)) setMode("idle");
      }}
    >
      <button type="button" className={`min-w-0 flex-1 ${openClassName}`} onClick={onOpen} aria-current={isCurrent ? true : undefined}>
        {children}
      </button>
      <button
        ref={moreButton}
        type="button"
        aria-label="Conversation actions"
        aria-haspopup="menu"
        aria-expanded={mode === "menu"}
        onClick={() => setMode(mode === "menu" ? "idle" : "menu")}
        className="ml-0.5 shrink-0 rounded-xs p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {mode === "menu" ? (
        <ConversationMenu
          onRename={() => setMode("rename")}
          onExport={() => { closeMenu(); void exportConversation(conversation); }}
          onDelete={() => setMode("delete")}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
};
