/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   filterCards.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CatalogueCard, CatalogueCategory } from "@/data/templates/catalogue/types";

export function filterCards(
  cards: CatalogueCard[],
  query: string,
  category: CatalogueCategory | "all",
): CatalogueCard[] {
  const needle = query.trim().toLowerCase();
  return cards.filter((card) => {
    if (category !== "all" && card.category !== category) return false;
    if (!needle) return true;
    return [card.title, card.description, card.category]
      .some((value) => value.toLowerCase().includes(needle));
  });
}
