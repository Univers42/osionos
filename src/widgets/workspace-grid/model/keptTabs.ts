/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keptTabs.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The tabs a pane keeps mounted (hidden) besides the active one, most recently
 * shown first. Returns `kept` itself when nothing changed, so a caller can store
 * it in state without looping.
 */
export function keepRecentTabs(
  kept: readonly string[],
  activeId: string | null,
  openIds: readonly string[],
  cap: number,
): readonly string[] {
  const open = new Set(openIds);
  const head = activeId && open.has(activeId) ? [activeId] : [];
  const next = [...head, ...kept.filter((id) => id !== activeId && open.has(id))].slice(0, cap);
  const same = next.length === kept.length && next.every((id, i) => id === kept[i]);
  return same ? kept : next;
}
