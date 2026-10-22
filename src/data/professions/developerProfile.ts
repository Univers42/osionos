/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   developerProfile.ts                                ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { bound, heading, profileShell } from "@/data/templates/templateBlocks";

/** The developer profile: the shared bound shell plus a projects section. */
export function developerProfileContent(): Block[] {
  return [
    ...profileShell("profession-developer"),
    heading("profession-developer-8", "Current projects", 2),
    bound("profession-developer-9", "custom:projects"),
  ];
}
