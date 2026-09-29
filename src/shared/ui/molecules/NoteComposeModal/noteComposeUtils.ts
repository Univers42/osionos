/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   noteComposeUtils.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/29 17:21:00 by serjimen          #+#    #+#             */
/*   Updated: 2026/09/29 17:21:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface KeyboardShortcutEvent {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  nativeEvent?: { isComposing?: boolean };
}

/**
 * Returns true if the keyboard event is a submit shortcut (Cmd+Enter or Ctrl+Enter)
 * while not in the middle of an IME composition.
 */
export function isSubmitShortcut(event: KeyboardShortcutEvent): boolean {
  if (event.nativeEvent?.isComposing) return false;
  return event.key === "Enter" && Boolean(event.metaKey || event.ctrlKey);
}

/**
 * Strips extraneous whitespace before submission.
 */
export function sanitizeNote(note: string): string {
  return note.trim();
}

/**
 * Safely extracts a readable error string from any thrown error or rejection.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return fallback;
}

/**
 * Formats character counter indicator for the compose textarea.
 */
export function formatCharacterCount(current: number, max: number): string {
  return `${current}/${max}`;
}
