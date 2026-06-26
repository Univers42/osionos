/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   marketplaceHeaderPreset.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { HeaderTemplate } from "@/entities/page/model/headerTemplate";

import { APP_KEYS } from "./appMeta";

/**
 * The VS Code-style app header (desing_header.png), expressed purely as data and bound
 * to the app property set: photo · title · company✓ + website · ⬇downloads · ★rating(count) ·
 * description · Pre-Release / Install / Auto-Update / ⚙config actions.
 */
export const MARKETPLACE_HEADER_TEMPLATE: HeaderTemplate = {
  id: "marketplace.app.v1",
  version: 1,
  layout: "media_aside",
  regions: [
    { id: "r-aside", kind: "aside", slots: [{ id: "s-media", kind: "media", bind: "icon" }] },
    { id: "r-title", kind: "main", slots: [{ id: "s-title", kind: "title", bind: "title" }] },
    {
      id: "r-meta",
      kind: "meta",
      slots: [
        { id: "s-company", kind: "author", bind: APP_KEYS.company, verifiedBind: APP_KEYS.verified },
        { id: "s-website", kind: "link", bind: APP_KEYS.website },
        { id: "s-downloads", kind: "stat", bind: APP_KEYS.downloads, icon: "icon:download", format: "number" },
      ],
    },
    { id: "r-desc", kind: "main", slots: [{ id: "s-desc", kind: "text", bind: APP_KEYS.description }] },
  ],
};
