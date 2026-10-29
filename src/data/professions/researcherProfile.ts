/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   researcherProfile.ts                               ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The researcher profile: the shared bound shell plus a research section. */
export function researcherProfileContent(): Block[] {
  return [
    ...profileShell("profession-researcher"),
    heading("profession-researcher-8", "Research notes", 2),
    bound("profession-researcher-9", "custom:research"),
  ];
}
