/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   designerProfile.ts                                 ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The designer profile: the shared bound shell plus a portfolio section. */
export function designerProfileContent(): Block[] {
  return [
    ...profileShell("profession-designer"),
    heading("profession-designer-8", "Portfolio", 2),
    bound("profession-designer-9", "custom:portfolio"),
  ];
}
