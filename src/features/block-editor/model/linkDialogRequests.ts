/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkDialogRequests.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

interface LinkDialogRequestsState {
  byBlockId: Record<string, { hintId?: string }>;
}

/** "Open this empty block's link dialog when it mounts", set by a slash shortcut
 *  such as `/youtube`. Transient on purpose: it is never written to the block, so a
 *  reload or another collaborator sees an ordinary empty block. */
export const useLinkDialogRequests = create<LinkDialogRequestsState>(() => ({ byBlockId: {} }));

export function requestLinkDialog(blockId: string, hintId?: string): void {
  useLinkDialogRequests.setState((state) => ({
    byBlockId: { ...state.byBlockId, [blockId]: { hintId } },
  }));
}

export function peekLinkDialogRequest(blockId: string): { hintId?: string } | null {
  return useLinkDialogRequests.getState().byBlockId[blockId] ?? null;
}

/** Read and clear the request for `blockId`; null when there is none. */
export function takeLinkDialogRequest(blockId: string): { hintId?: string } | null {
  const request = useLinkDialogRequests.getState().byBlockId[blockId];
  if (request === undefined) return null;
  useLinkDialogRequests.setState((state) => {
    const rest = { ...state.byBlockId };
    delete rest[blockId];
    return { byBlockId: rest };
  });
  return request;
}
