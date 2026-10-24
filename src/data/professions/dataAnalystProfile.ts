/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dataAnalystProfile.ts                              ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The data analyst profile: the shared bound shell plus an analyses section. */
export function dataAnalystProfileContent(): Block[] {
  return [
    ...profileShell("profession-data-analyst"),
    heading("profession-data-analyst-8", "Recent analyses", 2),
    bound("profession-data-analyst-9", "custom:analyses"),
  ];
}
