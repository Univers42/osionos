/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   teacherProfile.ts                                  ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The teacher profile: the shared bound shell plus a classes section. */
export function teacherProfileContent(): Block[] {
  return [
    ...profileShell("profession-teacher"),
    heading("profession-teacher-8", "Classes taught", 2),
    bound("profession-teacher-9", "custom:classes"),
  ];
}
