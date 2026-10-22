/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   creatorProfile.ts                                  ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The creator profile: the shared bound shell plus a latest-work section. */
export function creatorProfileContent(): Block[] {
  return [
    ...profileShell("profession-creator"),
    heading("profession-creator-8", "Latest work", 2),
    bound("profession-creator-9", "custom:work"),
  ];
}
