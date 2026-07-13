/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   QuickCaptureModal.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { Modal } from "@/shared/ui/primitives/Modal";
import { useToastStore } from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import { captureToDailyNote } from "../model/dailyNote";
import { useQuickCapture } from "../model/useQuickCapture";

/** Append a thought to today's daily note without leaving the current page. */
export const QuickCaptureModal: React.FC = () => {
  const open = useQuickCapture((s) => s.open);
  const setOpen = useQuickCapture((s) => s.setOpen);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const close = () => { setOpen(false); setText(""); setBusy(false); };

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const page = await captureToDailyNote(body);
      if (!page) {
        useToastStore.getState().push({ kind: "error", title: "No workspace to capture into" });
        setBusy(false);
        return;
      }
      useToastStore.getState().push({
        kind: "success",
        title: "Captured to today's note",
        action: {
          label: "Open note",
          onClick: () => usePageStore.getState().openPage({ id: page._id, workspaceId: page.workspaceId, kind: "page", title: page.title }),
        },
      });
      close();
    } catch {
      useToastStore.getState().push({ kind: "error", title: "Couldn't capture — try again" });
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void submit(); }
  }

  return (
    <Modal open={open} onClose={close} title="Quick capture" description="Append a note to today's daily note." size="sm" initialFocusRef={textareaRef as React.RefObject<HTMLElement>}>
      <div className="flex flex-col gap-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          placeholder="What's on your mind?"
          className="w-full resize-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--osio-fg-subtle)]">⌘↵ to save</span>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="rounded-md px-3 py-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">Cancel</button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!text.trim() || busy}
              className="rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Capture"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
