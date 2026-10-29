/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionClient.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SessionRow } from '@/store/settings/types';

export type ClientKind = 'web' | 'desktop' | 'mobile';

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = { web: 'Web', desktop: 'Desktop', mobile: 'Mobile' };
const CLIENT_KINDS: readonly ClientKind[] = ['web', 'desktop', 'mobile'];

/**
 * Which kind of client a session was opened from, read from its user agent: no row column
 * and no request header carries a client kind.
 *
 * Caveat: the Electron shell appends `Electron/<version>`, but the Tauri shell sends a plain
 * browser agent and lands in "web", a lying agent lands wherever it says, and a missing agent
 * falls back to "web" because most sign-ins are browsers. A tablet that asks for the desktop
 * site is "web". Misreading only moves a row between groups; it never hides one.
 */
export function classifyClient(userAgent?: string | null): ClientKind {
  const agent = userAgent ?? '';
  if (/Electron\//.test(agent)) return 'desktop';
  if (/Android|iPhone|iPad|iPod|Mobile/.test(agent)) return 'mobile';
  return 'web';
}

/**
 * A device name read from the user agent, e.g. "Chrome on Linux".
 *
 * Caveat: this matches on token patterns, so an unrecognised browser shows
 * "Browser on unknown OS" instead of the raw agent string.
 */
export function deviceName(userAgent?: string | null): string {
  const agent = userAgent ?? '';
  if (!agent) return 'Unknown device';
  const browser = /Edg\//.test(agent) ? 'Edge'
    : /OPR\//.test(agent) ? 'Opera'
    : /Firefox\//.test(agent) ? 'Firefox'
    : /Chrome\//.test(agent) ? 'Chrome'
    : /Safari\//.test(agent) ? 'Safari'
    : 'Browser';
  const os = /Windows/.test(agent) ? 'Windows'
    : /Android/.test(agent) ? 'Android'
    : /iPhone|iPad|iPod/.test(agent) ? 'iOS'
    : /Mac OS X|Macintosh/.test(agent) ? 'macOS'
    : /CrOS/.test(agent) ? 'ChromeOS'
    : /Linux/.test(agent) ? 'Linux'
    : 'unknown OS';
  return `${browser} on ${os}`;
}

export interface SessionGroup {
  kind: ClientKind;
  rows: SessionRow[];
}

/** The rows grouped web, desktop, mobile (in that order), each group in the server's order; empty groups are left out. */
export function groupSessions(rows: readonly SessionRow[]): SessionGroup[] {
  return CLIENT_KINDS
    .map((kind) => ({ kind, rows: rows.filter((row) => classifyClient(row.userAgent) === kind) }))
    .filter((group) => group.rows.length > 0);
}
