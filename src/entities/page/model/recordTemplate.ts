/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recordTemplate.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

/**
 * A record template: the standard child sub-pages auto-created under each record
 * of a database (the marketplace uses Details / Features / Changelog / Installation /
 * Categories / Resources). `rail: true` sub-pages render in the right info rail of the
 * detail view; the rest become the main DETAILS | FEATURES | CHANGELOG tab strip.
 */
export interface RecordSubPage {
  /** Stable slug used for ordering + tab/rail membership. */
  slug: string;
  title: string;
  icon?: string;
  /** Render in the right rail instead of the main tab strip. */
  rail?: boolean;
  /** Default block content seeded into the child page. */
  defaultContent?: Block[];
}

export interface RecordTemplate {
  id: string;
  subPages: RecordSubPage[];
}
