/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcpPolicy.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure MCP connection/restrict rules. Type-only imports so this stays free of
// the api-client / zustand shell and is directly unit-testable in the canvas
// (node --experimental-strip-types) runner.
import type { McpConnection, McpSettings } from './types';

/** Can a member connect `appId` right now? The one rule the store enforces and the UI mirrors. */
export function canConnectApp(settings: McpSettings, appId: string): boolean {
  if (!settings.connected) return false;
  if (settings.restrictPolicy === 'none') return false;
  if (settings.restrictPolicy === 'approved') return (settings.approvedApps ?? []).includes(appId);
  return true;
}

/** Add a member↔app link (idempotent — returns the same array if it already exists). */
export function addConnection(
  connections: McpConnection[],
  appId: string,
  member: { id: string; name: string },
  connectedAt: string,
): McpConnection[] {
  if (connections.some((c) => c.appId === appId && c.memberId === member.id)) return connections;
  return [...connections, { appId, memberId: member.id, memberName: member.name, connectedAt }];
}

/** Remove connections for an app — a single member's when `memberId` is given, else every member's. */
export function removeConnection(connections: McpConnection[], appId: string, memberId?: string): McpConnection[] {
  return connections.filter((c) => (c.appId !== appId ? true : memberId ? c.memberId !== memberId : false));
}

/** Distinct connected app ids (the "N connected" count in Manage). */
export function connectedAppIds(connections: McpConnection[]): string[] {
  return [...new Set(connections.map((c) => c.appId))];
}
