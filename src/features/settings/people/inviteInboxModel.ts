/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inviteInboxModel.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The invitee's inbox (Plan B): one sentence per /mine row, the expiry as text,
 * the plain sentence for every bridge refusal code, and the switcher badge.
 * Pure functions with `now` passed in, so a build of one menu classifies every
 * row against the same instant and tests never freeze a clock.
 */

import type { MineInvite } from "@/store/settings";

export interface PendingInvitesBadge {
  count: number;
  ariaLabel: string;
}

/** The trigger badge: count only (N26). Zero invites means no badge at all. */
export function pendingInvitesBadge(count: number): PendingInvitesBadge | null {
  if (!Number.isFinite(count) || count < 1) return null;
  const whole = Math.floor(count);
  return { count: whole, ariaLabel: `${whole} pending invite${whole === 1 ? "" : "s"}` };
}

/** The dialog's only source of text: the matching /mine row, never the link or a cache. */
export function inviteSentence(invite: Pick<MineInvite, "inviterName" | "workspaceName" | "role">): string {
  return `${invite.inviterName} invited you to ${invite.workspaceName} as ${invite.role}`;
}

/** Expiry as text. An unparsable date says nothing rather than "Invalid Date". */
export function inviteExpiryText(expiresAt: string, now = Date.now()): string {
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return "";
  const formatted = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(at);
  return at < now ? `This invite expired on ${formatted}.` : `This invite expires on ${formatted}.`;
}

/** The bridge code as one plain sentence. Never the server's raw message. */
export function inviteErrorSentence(code?: string | null): string {
  switch (code) {
    case "already_member":
      return "You are already a member of this workspace.";
    case "invite_used":
      return "This invite has already been used.";
    case "invite_expired":
      return "This invite has expired.";
    case "invite_declined":
      return "This invite was declined.";
    case "not_found":
    case "API_ERROR":
      return "This invite is no longer available.";
    default:
      return "Something went wrong. Try again.";
  }
}

/**
 * The workspace the accepted id belongs to, when it is already in the person's list.
 * Caveat: matched by name, because the 409 already_member answer carries no id — with
 * two workspaces of the same name it opens the first one. Escape hatch: the bridge
 * returning workspaceId on already_member.
 */
export function workspaceIdForName(
  name: string,
  workspaces: readonly { _id: string; name: string }[],
): string | null {
  return workspaces.find((workspace) => workspace.name === name)?._id ?? null;
}
