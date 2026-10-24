/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   insertTranscript.ts                                :+:      :+:    :+:   */
/*                                                   lis        lis    lis     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  lis       lis        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The transcript lands as TYPED INPUT.
 *
 * A dictation is text, and text is text: it goes into the editor where the
 * caret is, it never submits, it never presses Enter, and it never approves
 * anything. A spoken "approve" is a word in the box, and the user still has
 * to click.
 */

/** The composer a transcript lands in. */
export interface DictationTarget {
  /** The text of the composer. */
  value: string;
  /** Where the caret is. */
  caret: number;
  /** The composer takes the new text — and nothing else. */
  onChange(value: string): void;
}

/** The text of a transcript, inserted at the caret. */
export function insertTranscript(current: string, transcript: string, caret: number): string {
  const at = Math.max(0, Math.min(caret, current.length));
  return current.slice(0, at) + transcript + current.slice(at);
}

/**
 * The transcript lands in the composer, as typed input.
 *
 * The target is never submitted: a dictation that speaks "approve" or "delete
 * page" writes those words in the box, and the box waits for the user.
 */
export function applyTranscript(target: DictationTarget, transcript: string): string {
  const next = insertTranscript(target.value, transcript, target.caret);
  target.onChange(next);
  return next;
}
