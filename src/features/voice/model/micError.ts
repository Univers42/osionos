/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   micError.ts                                        :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The microphone is not always allowed.
 *
 * One sentence per refusal, shared by the voice note and the dictation: the
 * user reads the same words whichever button they pressed.
 */

/** What to say when the microphone refuses. */
export function micErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked — allow it via the camera/mic icon in your browser’s address bar, then retry.';
  }
  if (name === 'NotFoundError') return 'No microphone was found. Connect one and try again.';
  if (name === 'NotReadableError') return 'Your microphone is in use by another app. Close it and retry.';
  return 'Could not start recording. Check your browser’s microphone permission for this site.';
}
