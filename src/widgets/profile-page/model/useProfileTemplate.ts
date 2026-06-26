/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useProfileTemplate.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { useTemplateForSurface } from "@/widgets/page-renderer/model/useTemplateForSurface";

/** Back-compat alias — the profile shell is one surface of the generalized
 *  template system. Prefer `useTemplateForSurface("profile")` directly. */
export function useProfileTemplate(): Block[] | null {
  return useTemplateForSurface("profile");
}
