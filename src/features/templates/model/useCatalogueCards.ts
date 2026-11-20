/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCatalogueCards.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";

import type { CatalogueCard } from "@/data/templates/catalogue/types";

export function useCatalogueCards(): CatalogueCard[] | null {
  const [cards, setCards] = useState<CatalogueCard[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/data/templates/catalogue")
      .then(({ listCatalogue }) => listCatalogue())
      .then((catalogue) => {
        if (!cancelled) setCards(catalogue);
      })
      .catch((error) => {
        console.warn("page shells unavailable", error);
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return cards;
}
