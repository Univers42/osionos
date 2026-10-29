/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inviteDeepLink.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The ?invite=<token> boot link from an invite email or message: take the token out of the URL
 * at once (so it is not left in history or a shared screenshot), then, once the signed-in
 * identity has restored its layout, ask the bridge which invite it is.
 *
 * No accept happens on boot (N24): resolving only answers `{ id }` when the invite is
 * addressed to this account, and the dialog asks before anything joins. The token is spent
 * (cleared from sessionStorage) when the link is resolved into a dialog (N23), so the next
 * reload cannot act on it again.
 *
 * Caveat: a visitor who is signed out loses the link when the page reloads for sign-in, because
 * the token is dropped from the URL before a session exists; the token is kept in sessionStorage
 * for that round trip. A session that never resolves never resolves the link either.
 */

import { whenLayoutIsRestored } from "@/features/settings/model/settingsDeepLink";
import { useToastStore } from "@osionos/ui/primitives";
import { useWorkspaceInvitesStore } from "@/store/settings";

const PENDING_KEY = "osionos.pendingInvite";
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** One neutral sentence for every refusal: wrong account, used, expired, declined, unknown. */
export const INVITE_LINK_REFUSED = "This invite link is not valid for this account.";

function readStored(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(PENDING_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStored(token: string | null): void {
  try {
    if (token) globalThis.sessionStorage?.setItem(PENDING_KEY, token);
    else globalThis.sessionStorage?.removeItem(PENDING_KEY);
  } catch {
    // Private mode: the link then works only without a sign-in round trip.
  }
}

/** The token a link carries and the URL with the param removed. */
export function readInviteLink(search: string): string | null {
  const token = new URLSearchParams(search).get("invite");
  return token && TOKEN_SHAPE.test(token) ? token : null;
}

function dropInviteParam(): void {
  const { pathname, search, hash } = globalThis.location;
  const params = new URLSearchParams(search);
  params.delete("invite");
  const query = params.toString();
  globalThis.history.replaceState(globalThis.history.state, "", `${pathname}${query ? `?${query}` : ""}${hash}`);
}

export function applyInviteDeepLink(): void {
  const linked = readInviteLink(globalThis.location?.search ?? "");
  if (linked) {
    writeStored(linked);
    dropInviteParam();
  }
  const token = linked ?? readStored();
  if (!token) return;
  whenLayoutIsRestored(() => {
    // The link has done its job once it names an invite; the dialog decides the rest.
    writeStored(null);
    void useWorkspaceInvitesStore.getState().resolve(token).then((inviteId) => {
      if (!inviteId) {
        useToastStore.getState().push({ kind: "info", title: INVITE_LINK_REFUSED });
        return;
      }
      useWorkspaceInvitesStore.getState().openInvite(inviteId);
    });
  });
}
