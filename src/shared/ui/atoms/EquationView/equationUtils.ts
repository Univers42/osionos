/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   equationUtils.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/29 17:47:00 by serjimen          #+#    #+#             */
/*   Updated: 2026/09/29 17:47:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Returns an accessible label for the formula. If source is empty,
 * it returns a helpful placeholder representation.
 */
export function formatEquationAriaLabel(source: string, displayMode = true): string {
  const trimmed = source.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return displayMode ? "E = mc^2" : "math equation";
}

/**
 * Normalizes equation input by stripping leading/trailing whitespace
 * while preserving inner LaTeX syntax and indentation.
 */
export function sanitizeEquationSource(source: string): string {
  return source.trim();
}

/**
 * Safely copies text to clipboard if the Clipboard API is available.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
