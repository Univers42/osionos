/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectorMachine.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ConnectionState } from "./connectorTypes";

/**
 * The connection state machine (§6.2):
 *   disconnected → connecting → connected
 *   error reachable from connecting/connected; disconnect() returns to disconnected.
 * Pure + transport-free so it is fully unit-testable.
 */
const EDGES: Record<ConnectionState, readonly ConnectionState[]> = {
  disconnected: ["connecting"],
  connecting: ["connected", "error", "disconnected"],
  connected: ["connecting", "error", "disconnected"],
  error: ["connecting", "disconnected"],
};

export function canTransition(from: ConnectionState, to: ConnectionState): boolean {
  return from === to || (EDGES[from]?.includes(to) ?? false);
}

/** Returns `to` if the transition is legal, else throws (guards against illegal jumps). */
export function assertTransition(from: ConnectionState, to: ConnectionState): ConnectionState {
  if (!canTransition(from, to)) {
    throw new Error(`invalid connector transition: ${from} → ${to}`);
  }
  return to;
}
