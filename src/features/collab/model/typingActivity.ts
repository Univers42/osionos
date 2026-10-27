/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   typingActivity.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Who is typing right now, derived from timestamps instead of timers: a member is
 * typing for TYPING_IDLE_MS after the last remote edit of theirs was applied. The
 * roster asks "who is typing at `now`" and asks "when does that next change", so
 * one shared timeout serves every avatar and nothing polls.
 *
 * Caveat: an edit is the only signal. Someone holding a key down, or pasting, reads
 * as typing; someone thinking with the caret blinking does not. A member whose
 * edits are held back by the local caret's block (useLiveBlockSync) shows up when
 * the hold releases, up to 1.5 s late.
 */

export const TYPING_IDLE_MS = 1500;

/** Last applied edit per member id, in ms. Holds only members edited within the idle window. */
export type EditedAt = Readonly<Record<string, number>>;

/** `editedAt` with `memberId` stamped at `at`, and every member already idle at `at`
 *  dropped, so the record stays bounded by who edited in the last 1.5 s. */
export function noteEdit(editedAt: EditedAt, memberId: string, at: number): EditedAt {
  const next: Record<string, number> = {};
  for (const [id, last] of Object.entries(editedAt)) {
    if (id !== memberId && last + TYPING_IDLE_MS > at) next[id] = last;
  }
  next[memberId] = at;
  return next;
}

export function typingMembers(editedAt: EditedAt, now: number): Set<string> {
  const typing = new Set<string>();
  for (const [id, last] of Object.entries(editedAt)) {
    if (last + TYPING_IDLE_MS > now) typing.add(id);
  }
  return typing;
}

/** Ms until the first typing member goes idle, or null when nobody is typing. */
export function nextTypingExpiry(editedAt: EditedAt, now: number): number | null {
  let soonest: number | null = null;
  for (const last of Object.values(editedAt)) {
    const left = last + TYPING_IDLE_MS - now;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest;
}
