/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideFsEvents.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { FsEvent } from "./ideFsEcho";

/** Per-workspace fan-out of the fs-agent's raw events: the fsync socket (owned
 *  by useIdeFsSync) publishes; the sandbox:// provider's watch() and any other
 *  consumer subscribe — one socket, many watchers (ADR-001 watch-as-first-class). */
type Listener = (event: FsEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function publishFsEvent(workspaceId: string, event: FsEvent): void {
  for (const listener of listeners.get(workspaceId) ?? []) listener(event);
}

export function subscribeFsEvents(workspaceId: string, listener: Listener): () => void {
  const set = listeners.get(workspaceId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(workspaceId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(workspaceId);
  };
}
