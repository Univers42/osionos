/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   originStorage.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** A localStorage stand-in for a full origin: every key and value counts against `quota`
 *  characters, and a write over it throws as QuotaExceededError does, leaving the old value. */
export function originStorage(quota: number, entries: Record<string, string> = {}) {
  const items = new Map(Object.entries(entries));
  const used = (): number => [...items].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  return {
    items,
    used,
    get length() { return items.size; },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => { items.delete(key); },
    setItem(key: string, value: string) {
      const before = items.get(key);
      items.set(key, value);
      if (used() <= quota) return;
      if (before === undefined) items.delete(key);
      else items.set(key, before);
      throw new Error("QuotaExceededError");
    },
  };
}
