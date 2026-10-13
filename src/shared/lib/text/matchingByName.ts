/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   matchingByName.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 06:35:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 06:35:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Items whose name contains `query`, ignoring case and accents ("cafe" finds
 *  "Café"). An empty query returns the list unchanged (same array). */
export function matchingByName<T extends { name?: string | null }>(items: readonly T[], query: string): readonly T[] {
  const needle = fold(query.trim());
  if (!needle) return items;
  return items.filter((item) => fold(item.name ?? "").includes(needle));
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
