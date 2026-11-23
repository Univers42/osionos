/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   catalogueGate.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { CatalogueCard } from "@/data/templates/catalogue/types";
import { isLayoutModesEnabled } from "@/shared/config/featureFlags";

/** The shipped template cards every surface lists. A catalogue template carries region cells,
 *  a TD18 writer, so with osio.layout.modes off there are none to offer (groot ADR 0067 RD7);
 *  the catalogue chunk is not even fetched. */
export async function listEnabledCatalogue(): Promise<CatalogueCard[]> {
  if (!isLayoutModesEnabled()) return [];
  return (await import("@/data/templates/catalogue")).listCatalogue();
}
