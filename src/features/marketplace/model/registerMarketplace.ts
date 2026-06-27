/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   registerMarketplace.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { registerHeaderTemplate, registerRecordTemplate } from "@/entities/page/model/templateRegistry";

import { MARKETPLACE_DATABASE_ID } from "./appMeta";
import { MARKETPLACE_HEADER_TEMPLATE } from "./marketplaceHeaderPreset";
import { MARKETPLACE_RECORD_TEMPLATE } from "./marketplaceRecordTemplate";

let registered = false;

/** Register the marketplace header + record templates against the marketplace database id (idempotent). */
export function registerMarketplaceTemplates(): void {
  if (registered) return;
  registered = true;
  registerHeaderTemplate(MARKETPLACE_DATABASE_ID, MARKETPLACE_HEADER_TEMPLATE);
  registerRecordTemplate(MARKETPLACE_DATABASE_ID, MARKETPLACE_RECORD_TEMPLATE);
}
