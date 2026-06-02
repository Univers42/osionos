/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDebouncedValue.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates `delayMs` after the last change.
 * Used to keep the raw-mode preview off the keystroke path: the textarea tracks
 * the live value (instant), the expensive parse/render uses the debounced one
 * and so runs only when typing pauses.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = globalThis.setTimeout(() => setDebounced(value), delayMs);
    return () => globalThis.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
