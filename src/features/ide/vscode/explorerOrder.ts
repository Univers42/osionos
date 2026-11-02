/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorerOrder.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// VS Code explorer's default order (explorer.sortOrder "default"): folders first, then files,
// each by name, numbers numerically, case ignored.
const NAME_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export type ExplorerEntry = { name: string; isDirectory: boolean };

export function explorerOrder<T extends ExplorerEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || NAME_ORDER.compare(a.name, b.name));
}
