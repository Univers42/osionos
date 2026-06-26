/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileChrome.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { MessageCircle, MoreHorizontal } from "lucide-react";

import { ConnectButton } from "@/features/connections/ConnectButton";
import { ContactContextMenu } from "@/features/connections/ContactContextMenu";
import { useUserStore } from "@/features/auth";
import { openDm } from "@/shared/chat/channelApi";
import { genId } from "@/widgets/workspace-grid/model/layoutTree";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

/**
 * Shared profile chrome — the Message / Connect / More actions row, shown only
 * when viewing someone else. Used by both the built-in ProfileView (fallback)
 * and the admin-template ProfilePageView so the DM/connect logic lives once.
 */
export function ProfileActions({ userId, name }: { userId: string; name: string }): React.ReactElement | null {
  const activeUserId = useUserStore((s) => s.activeUserId);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  if (userId === activeUserId) return null;

  const startDm = () => {
    openDm(userId)
      .then((channel) => {
        useWorkspaceLayout.getState().openTab({
          tabId: genId("tab"),
          pageId: channel.id,
          workspaceId: channel.workspaceId,
          kind: "channel",
          title: channel.name,
          icon: "icon:message-circle",
        });
      })
      .catch(() => undefined);
  };

  return (
    <div className="mt-6 flex items-center gap-2">
      <button
        type="button"
        onClick={startDm}
        className="inline-flex items-center gap-2 rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
      >
        <MessageCircle size={16} /> Message
      </button>
      <ConnectButton userId={userId} name={name} />
      <button
        ref={moreRef}
        type="button"
        aria-label="More actions"
        onClick={() => setMenuOpen((value) => !value)}
        className="inline-flex items-center justify-center rounded-md border border-[var(--osio-border-default)] p-2 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
      >
        <MoreHorizontal size={16} />
      </button>
      <ContactContextMenu userId={userId} name={name} anchorRef={moreRef} open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
