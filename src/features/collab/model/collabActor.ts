/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collabActor.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 12:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One tab id per browser tab, shared by every outbound collab event so the
 * bridge can force the `uid:` prefix and tell tabs of the same user apart
 * (f1). The charset/length match the bridge's `tabId` validation.
 */
/** Generate a bridge-valid tab id (charset/length). Call once per module/tab. */
export function randomTabId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 32) || `t-${Date.now()}`;
}

/** Build the f1 actor string `<userId>:<tabId>` (tab id validated server-side). */
export function actorFor(userId: string, tab: string): string {
  return `${userId}:${tab}`;
}
