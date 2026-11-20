/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageShellCards.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";

import type { CatalogueCard } from "@/data/templates/catalogue/types";

export function usePageShellCards(): CatalogueCard[] {
  const [cards, setCards] = useState<CatalogueCard[]>([]);
  useEffect(() => {
    let cancelled = false;
    void import("@/data/templates/catalogue")
      .then(({ listCatalogue }) => listCatalogue())
      .then((catalogue) => {
        if (!cancelled) setCards(catalogue.filter((card) => card.category === "page"));
      })
      .catch((error) => console.warn("page shells unavailable", error));
    return () => {
      cancelled = true;
    };
  }, []);
  return cards;
}
