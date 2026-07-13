/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageCommentsButton.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useClickOutside, useEscapeKey } from "@/shared/ui";
import { useUserStore } from "@/features/auth";
import { isCommentsEnabled } from "@/shared/config/featureFlags";
import { useComments } from "../model/useComments";
import { CommentsPanel } from "./CommentsPanel";

/** Page-header comments affordance: a count badge + a dropdown thread. */
export const PageCommentsButton: React.FC<{ pageId: string }> = ({ pageId }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const meId = useUserStore((s) => s.activeUserId);
  const { comments, loading, add, resolve, remove } = useComments(pageId, isCommentsEnabled());
  useClickOutside(wrapRef, () => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  if (!isCommentsEnabled()) return null;
  const openCount = comments.filter((comment) => !comment.resolvedAt).length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Comments"
        title="Comments"
        className="relative flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
      >
        <MessageSquare size={16} />
        {openCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full bg-[var(--osio-accent)] px-1 text-center text-[9px] font-semibold leading-[14px] text-[var(--osio-accent-fg)]">
            {openCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[var(--osio-z-popover)] mt-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-menu)]">
          <CommentsPanel comments={comments} loading={loading} meId={meId} onAdd={add} onResolve={resolve} onRemove={remove} />
        </div>
      )}
    </div>
  );
};
