/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gourmandViewPresets.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Preset pack for the VITE & GOURMAND client mount — the restaurant's REAL
 * Supabase tables (PascalCase Prisma names: "Order", "Menu", "Dish",
 * "WorkingHours", …, mounted `tenant_owned`). Their status-like columns are
 * plain TEXT, so `selectColumns` synthesizes the select options from the
 * observed rows — that's what gives the order pipeline its board lanes. The
 * delivery map derives `place` from "UserAddress".latitude/longitude
 * (Decimal → toNumberValue inside the place decoder). Registered through the
 * composable liveViewPresets registry; PascalCase keys cannot collide with
 * the lowercase commerce/ops/agency packs.
 */

import type { DatabaseSchema, ViewConfig } from "@/shared/notion-database-sys/src/component/types";
import type { LiveMountRef } from "@/shared/notion-database-sys/src/store/live/liveTypes";
import {
  registerLiveTablePresets,
  type LiveTablePreset,
} from "@/shared/notion-database-sys/src/store/live/liveViewPresets";
import { gourmandViews } from "./gourmandViewPresets.views";

function tableViews(database: DatabaseSchema, ref: LiveMountRef): ViewConfig[] {
  return gourmandViews(database, ref.table);
}

/** Presets keyed by the client's PascalCase table names. */
const GOURMAND_TABLE_PRESETS: Record<string, LiveTablePreset> = {
  Order: { selectColumns: ["status", "delivery_city"], views: tableViews },
  KanbanColumn: { selectColumns: ["mapped_status"], views: tableViews },
  Menu: { selectColumns: ["status"], views: tableViews },
  Dish: { selectColumns: ["course_type"], views: tableViews },
  WorkingHours: { views: tableViews },
  TimeOffRequest: { selectColumns: ["type", "status"], views: tableViews },
  SupportTicket: { selectColumns: ["status", "priority", "category"], views: tableViews },
  UserAddress: {
    selectColumns: ["city"],
    place: { lat: "latitude", lng: "longitude", address: "street_address" },
    views: tableViews,
  },
  Event: { selectColumns: ["event_type"], views: tableViews },
  Publish: { selectColumns: ["status"] },
  DeliveryAssignment: { selectColumns: ["status", "vehicle_type"] },
  Promotion: { selectColumns: ["type"] },
};

registerLiveTablePresets((ref) => GOURMAND_TABLE_PRESETS[ref.table] ?? null);
