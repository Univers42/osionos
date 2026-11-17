/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   quota-storage.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** A Storage that counts key + value characters, as the browsers' quota does, and refuses a
 *  write past `limit`, any write to a key in `refused`, a write to a key in `fullWhilePageCached`
 *  while a workspace page cache is stored, and the next N writes to a key counted in `refusals`,
 *  with a QuotaExceededError. */
export class QuotaStorage {
  readonly data = new Map<string, string>();
  limit = Number.POSITIVE_INFINITY;
  readonly refused = new Set<string>();
  readonly fullWhilePageCached = new Set<string>();
  readonly refusals = new Map<string, number>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); this.limit = Number.POSITIVE_INFINITY; this.refused.clear(); this.fullWhilePageCached.clear(); this.refusals.clear(); }
  used() { let total = 0; for (const [key, value] of this.data) total += key.length + value.length; return total; }
  setItem(key: string, value: string) {
    const text = String(value);
    const previous = this.data.get(key);
    const next = this.used() - (previous === undefined ? 0 : key.length + previous.length) + key.length + text.length;
    const cached = this.fullWhilePageCached.has(key) && [...this.data.keys()].some((stored) => stored.startsWith("osio:pages:ws"));
    const counted = (this.refusals.get(key) ?? 0) > 0;
    if (counted) this.refusals.set(key, (this.refusals.get(key) ?? 0) - 1);
    if (this.refused.has(key) || cached || counted || next > this.limit) throw new DOMException("Setting the value exceeded the quota.", "QuotaExceededError");
    this.data.set(key, text);
  }
}
