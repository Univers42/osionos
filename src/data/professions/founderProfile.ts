/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   founderProfile.ts                                  ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The founder profile: the shared bound shell plus a milestones section. */
export function founderProfileContent(): Block[] {
  return [
    ...profileShell("profession-founder"),
    heading("profession-founder-8", "Company milestones", 2),
    bound("profession-founder-9", "custom:milestones"),
  ];
}
