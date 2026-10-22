/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   studentProfile.ts                                  ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The student profile: the shared bound shell plus a study section. */
export function studentProfileContent(): Block[] {
  return [
    ...profileShell("profession-student"),
    heading("profession-student-8", "Current study", 2),
    bound("profession-student-9", "custom:study"),
  ];
}
