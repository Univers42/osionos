/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { DatabaseSlice } from "@/features/templates/model/templateSlice";

export type CatalogueCategory = "work" | "personal" | "school" | "team";

export interface CatalogueCard {
  id: string;
  title: string;
  icon: string;
  description: string;
  category: CatalogueCategory;
}

export interface TemplateBody {
  content: Block[];
  databases: DatabaseSlice;
}

export type CatalogueTemplate = CatalogueCard & TemplateBody;
