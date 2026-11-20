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

import { useMemo } from "react";

import type { CatalogueCard } from "@/data/templates/catalogue/types";
import { useCatalogueCards } from "@/features/templates/model/useCatalogueCards";

export function usePageShellCards(): CatalogueCard[] {
  const cards = useCatalogueCards();
  return useMemo(
    () => cards?.filter((card) => card.category === "page") ?? [],
    [cards],
  );
}
