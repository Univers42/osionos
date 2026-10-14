/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   key-store-fixtures.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** A store that holds one key and, like zustand, notifies every listener on every set. */
export function keyStore(initial: string | null) {
  let key = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    read: () => key,
    set(next: string | null) {
      key = next;
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
}
