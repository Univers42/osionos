/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionSelect.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The cross-account isolation rule for which persisted bridge sessions to
 * activate on init. Pure + dependency-free so it can be unit-tested directly.
 *
 * - Fresh website handoff (`fromUserId` set) = a PRIMARY login: it REPLACES the
 *   account set, so a new sign-in NEVER inherits another person's session left in
 *   this browser. It MERGES only when the user deliberately chose "Add another
 *   account" (`adding === true`).
 * - No handoff (`fromUserId === null`, a plain refresh): restore EVERY persisted
 *   account (the accumulate-across-refresh behavior — deliberate in-app adds
 *   persist here).
 *
 * Because the caller re-persists exactly the returned records, REPLACE also
 * purges the prior user's token/persona/workspaces from disk.
 */
export function selectActivatedSessions<T extends { session: { userId: string } }>(
  fromUserId: string | null,
  fromRecord: T | null,
  persisted: Record<string, T>,
  adding: boolean,
): T[] {
  if (fromUserId && fromRecord) {
    const base: Record<string, T> = adding ? { ...persisted } : {};
    base[fromUserId] = fromRecord;
    return Object.values(base);
  }
  return Object.values(persisted);
}
