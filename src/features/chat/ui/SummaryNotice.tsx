/**
 * The line at the top of a thread that says earlier turns are out of the
 * assistant's window, with a way to read or clear the summary that stands in
 * for them.
 *
 * The summary is model output about text nobody vetted: it is shown as plain
 * text (React escapes it, `whitespace-pre-wrap` keeps its lines), never as
 * markdown, a link or HTML.
 */

import React, { useState } from "react";
import { History } from "lucide-react";

import { noticeOf, throughLabel } from "../model/summaryNotice";
import { entryOf, useSummaryStore } from "../model/useSummaryStore";
import { useChatStore } from "../model/useChatStore";

const LINK_BUTTON =
  "cursor-pointer rounded-xs px-1 font-medium text-[var(--osio-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";

export const SummaryNotice: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const entry = useSummaryStore((s) => entryOf(s, conversationId));
  const serverId = useChatStore((s) => s.conversations.find((c) => c.id === conversationId)?.serverConversationId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const notice = noticeOf(entry.summary, entry.truncated);
  if (notice === "none") return null;
  if (notice === "beyond") {
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--osio-fg-muted)]" data-testid="summary-notice">
        <History size={14} aria-hidden="true" />
        Earlier messages are beyond what the assistant reads
      </p>
    );
  }

  const toggle = () => {
    // The live frame said "summarised" before the transcript knew the text.
    if (!open && !entry.summary && serverId) void useSummaryStore.getState().refresh(conversationId, serverId);
    setOpen(!open);
  };
  const clear = async () => {
    if (!serverId) return;
    setBusy(true);
    setFailed(false);
    try {
      await useSummaryStore.getState().clear(conversationId, serverId);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 text-xs text-[var(--osio-fg-muted)]" data-testid="summary-notice">
      <div className="flex flex-wrap items-center gap-2">
        <History size={14} aria-hidden="true" />
        <span>Earlier messages are summarised</span>
        <button type="button" className={LINK_BUTTON} aria-expanded={open} aria-label="View summary of earlier messages" onClick={toggle}>View</button>
        <button type="button" className={LINK_BUTTON} aria-label="Clear summary" disabled={busy} onClick={() => void clear()}>Clear summary</button>
        {failed ? <span role="alert" className="text-[var(--osio-danger)]">Could not clear the summary. Try again.</span> : null}
      </div>
      {open ? (
        <div className="rounded-md bg-[var(--osio-bg-subtle)] p-3 text-[var(--osio-fg-default)]" data-testid="summary-text">
          {entry.summary ? (
            <>
              <p className="mb-1 text-[var(--osio-fg-muted)]">Covers messages up to {throughLabel(entry.summary.through)}</p>
              <p className="whitespace-pre-wrap break-words">{entry.summary.text}</p>
            </>
          ) : (
            <p>{entry.summary === null ? "The summary is not available." : "Loading the summary…"}</p>
          )}
        </div>
      ) : null}
    </div>
  );
};
