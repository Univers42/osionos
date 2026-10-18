/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkDialogRequests.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "Open this empty block's link dialog when it mounts", set by a slash shortcut such as
// `/youtube`. Transient on purpose: never written to the block, so a reload or another
// collaborator sees an ordinary empty block. Keyed by the editor surface as well as the
// block id, because the same page open in two panes renders the same block ids twice.

export interface LinkDialogRequest {
  hintId?: string;
}

const requests = new Map<string, LinkDialogRequest>();

const requestKey = (surfaceId: string, blockId: string): string => `${surfaceId}\u0000${blockId}`;

export function requestLinkDialog(surfaceId: string, blockId: string, hintId?: string): void {
  requests.set(requestKey(surfaceId, blockId), { hintId });
}

export function peekLinkDialogRequest(surfaceId: string, blockId: string): LinkDialogRequest | null {
  return requests.get(requestKey(surfaceId, blockId)) ?? null;
}

/** Read and clear the request; null when there is none. */
export function takeLinkDialogRequest(surfaceId: string, blockId: string): LinkDialogRequest | null {
  const key = requestKey(surfaceId, blockId);
  const request = requests.get(key) ?? null;
  requests.delete(key);
  return request;
}
