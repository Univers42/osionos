/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   marketplaceRecordTemplate.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { RecordTemplate } from "@/entities/page/model/recordTemplate";

/**
 * Standard sub-pages of a marketplace app record (sub-items of the parent record).
 * The first three are the main DETAILS | FEATURES | CHANGELOG tab strip; the `rail`
 * ones populate the right info rail (Installation / Categories / Resources).
 */
export const MARKETPLACE_RECORD_TEMPLATE: RecordTemplate = {
  id: "marketplace.record.v1",
  subPages: [
    { slug: "details", title: "Details", icon: "icon:file-text" },
    { slug: "features", title: "Features", icon: "icon:sparkles" },
    { slug: "changelog", title: "Changelog", icon: "icon:history" },
    { slug: "installation", title: "Installation", icon: "icon:download", rail: true },
    { slug: "categories", title: "Categories", icon: "icon:tag", rail: true },
    { slug: "resources", title: "Resources", icon: "icon:link", rail: true },
  ],
};

/** Slugs shown as main tabs vs the right rail (consumed by the detail view). */
export const MARKETPLACE_TAB_SLUGS = ["details", "features", "changelog"] as const;
export const MARKETPLACE_RAIL_SLUGS = ["installation", "categories", "resources"] as const;
