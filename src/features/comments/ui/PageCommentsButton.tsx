/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageCommentsButton.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useClickOutside, useEscapeKey } from "@/shared/ui";
import { useUserStore } from "@/features/auth";
import { isCommentsEnabled } from "@/shared/config/featureFlags";
import { useComments } from "../model/useComments";
import { useCommentsPanelStore } from "../model/commentsPanelStore";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { quoteForAssistant } from "@/features/chat/model/assistantHandoff";
import { openAssistantWith } from "@/features/chat/model/openAssistantWith";
import { threadEntries } from "../model/askAboutThread";
import { CommentsPanel } from "./CommentsPanel";

/** Page-header comments affordance: a count badge + a dropdown thread. */
export const PageCommentsButton: React.FC<{ pageId: string }> = ({ pageId }) => {
  const [open, setOpen] = useState(false);
  const [manualBlockId, setManualBlockId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const meId = useUserStore((s) => s.activeUserId);
  const { comments, loading, add, resolve, remove } = useComments(pageId, isCommentsEnabled());
  const request = useCommentsPanelStore((s) =>
    s.request?.pageId === pageId ? s.request : null,
  );

  // A request from the selection toolbar opens the panel on that block; the
  // request itself is the open state until the panel is closed.
  const panelOpen = open || Boolean(request);
  const commentBlockId = request?.blockId ?? manualBlockId;

  const closePanel = () => {
    setOpen(false);
    setManualBlockId(null);
    useCommentsPanelStore.getState().clear();
  };
  useClickOutside(wrapRef, closePanel, panelOpen);
  useEscapeKey(closePanel, panelOpen);

  if (!isCommentsEnabled()) return null;
  const openCount = comments.filter((comment) => !comment.resolvedAt).length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (panelOpen) {
            closePanel();
            return;
          }
          setManualBlockId(null);
          setOpen(true);
        }}
        aria-label="Comments"
        title="Comments"
        className="relative flex h-7 w-7 items-center justify-center rounded-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
      >
        <MessageSquare size={16} />
        {openCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full bg-[var(--osio-accent)] px-1 text-center text-3xs font-semibold leading-[14px] text-[var(--osio-accent-fg)]">
            {openCount}
          </span>
        )}
      </button>
      {panelOpen && (
        <div className="absolute right-0 top-full z-[var(--osio-z-popover)] mt-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-menu)]">
          <CommentsPanel
            pageId={pageId}
            comments={comments}
            loading={loading}
            meId={meId}
            onAdd={(content, acknowledgeWarning) => add(content, commentBlockId, acknowledgeWarning)}
            onResolve={resolve}
            onRemove={remove}
            onAskAI={isAiConfigured() ? () => {
              openAssistantWith({ text: quoteForAssistant(threadEntries(comments, meId)), pageId });
              closePanel();
            } : undefined}
          />
        </div>
      )}
    </div>
  );
};
