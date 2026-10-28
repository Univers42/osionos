/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   InviteDecisionDialog.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The invite decision (N23/N24): an invite link only names an id, so the dialog's
 * text comes from the matching /mine row — never from the link. Join is the by-id
 * accept followed by the existing enterJoinedWorkspace flow; Decline is by-id too.
 * Closing or Escape decides nothing.
 *
 * Lazy-loaded from the switcher: it is not part of the warm entry chunk.
 */

import React, { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/shared/ui";
import { useToastStore } from "@osionos/ui/primitives";
import { useUserStore } from "@/features/auth";
import { useWorkspaceInvitesStore } from "@/store/settings";
import { enterJoinedWorkspace } from "@/features/settings/people/enterJoinedWorkspace";
import {
  inviteErrorSentence,
  inviteExpiryText,
  inviteSentence,
  workspaceIdForName,
} from "@/features/settings/people/inviteInboxModel";

interface Props {
  inviteId: string;
  onClose: () => void;
}

const ACTION_CLASS =
  "min-h-11 rounded-[var(--osio-radius-control)] px-4 text-sm font-medium outline-none " +
  "transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 " +
  "focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-[var(--osio-bg-subtle)] disabled:opacity-60";

export const InviteDecisionDialog: React.FC<Props> = ({ inviteId, onClose }) => {
  const titleRef = useRef<HTMLDivElement>(null);
  const mine = useWorkspaceInvitesStore((state) => state.mine);
  const fetchMine = useWorkspaceInvitesStore((state) => state.fetchMine);
  const acceptById = useWorkspaceInvitesStore((state) => state.acceptById);
  const decline = useWorkspaceInvitesStore((state) => state.decline);
  const refreshWorkspaces = useUserStore((state) => state.refreshWorkspaces);
  const switchWorkspace = useUserStore((state) => state.switchWorkspace);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"join" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);

  const row = mine.find((invite) => invite.id === inviteId);

  useEffect(() => {
    let alive = true;
    void fetchMine().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchMine, inviteId]);

  async function join() {
    if (!row || busy) return;
    setBusy("join");
    setError(null);
    setAlreadyMember(false);
    const result = await acceptById(row.id);
    setBusy(null);
    if (!result.ok) {
      setError(inviteErrorSentence(result.code));
      setAlreadyMember(result.code === "already_member");
      if (result.code === "already_member") void fetchMine();
      return;
    }
    useToastStore.getState().push({ kind: "success", title: "You joined the workspace" });
    const { activeUserId } = useUserStore.getState();
    void enterJoinedWorkspace(result.workspaceId, {
      refreshWorkspaces: () => refreshWorkspaces(activeUserId),
      switchWorkspace,
    });
    onClose();
  }

  async function declineInvite() {
    if (!row || busy) return;
    setBusy("decline");
    setError(null);
    const declined = await decline(row.id);
    setBusy(null);
    if (!declined) {
      setError(inviteErrorSentence("unknown"));
      return;
    }
    useToastStore.getState().push({ kind: "success", title: "Invite declined" });
    onClose();
  }

  async function openWorkspace() {
    const { activeUserId, sessions } = useUserStore.getState();
    const liveSession = sessions[activeUserId];
    const live = [...(liveSession?.privateWorkspaces ?? []), ...(liveSession?.sharedWorkspaces ?? [])];
    let workspaceId = row ? workspaceIdForName(row.workspaceName, live) : null;
    if (!workspaceId && activeUserId) {
      await refreshWorkspaces(activeUserId).catch(() => undefined);
      const refreshed = useUserStore.getState().sessions[activeUserId];
      const next = [...(refreshed?.privateWorkspaces ?? []), ...(refreshed?.sharedWorkspaces ?? [])];
      workspaceId = row ? workspaceIdForName(row.workspaceName, next) : null;
    }
    if (workspaceId) switchWorkspace(workspaceId);
    onClose();
  }

  return (
    <Modal open onClose={onClose} size="sm" title="Workspace invite" initialFocusRef={titleRef as React.RefObject<HTMLElement>}>
      <div className="space-y-4 p-6">
        <div
          ref={titleRef}
          tabIndex={-1}
          className="text-lg font-semibold text-[var(--osio-fg-default)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        >
          Workspace invite
        </div>

        <div className="min-h-[7.5rem] space-y-2">
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-4 w-4/5 animate-pulse rounded-xs bg-[var(--osio-bg-muted)]" />
              <div className="h-4 w-3/5 animate-pulse rounded-xs bg-[var(--osio-bg-muted)]" />
              <span className="sr-only">Loading invite</span>
            </div>
          ) : row ? (
            <>
              <p className="text-sm text-[var(--osio-fg-default)] [overflow-wrap:anywhere]">
                {inviteSentence(row)}
              </p>
              <p className="text-xs text-[var(--osio-fg-muted)]">{inviteExpiryText(row.expiresAt)}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--osio-fg-default)]">This invite is no longer available.</p>
          )}

          {error ? (
            <p role="alert" className="rounded-md bg-[var(--osio-danger-subtle-bg-hover)] px-3 py-2 text-sm text-[var(--osio-danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {alreadyMember ? (
            <Button className={ACTION_CLASS} onClick={() => void openWorkspace()}>
              Open workspace
            </Button>
          ) : null}
          <Button
            className={ACTION_CLASS}
            tone="ghost"
            disabled={!row || busy !== null}
            onClick={() => void declineInvite()}
          >
            {busy === "decline" ? "Declining…" : "Decline"}
          </Button>
          <Button
            className={ACTION_CLASS}
            tone="primary"
            disabled={!row || busy !== null}
            onClick={() => void join()}
          >
            {busy === "join" ? "Joining…" : "Join workspace"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
