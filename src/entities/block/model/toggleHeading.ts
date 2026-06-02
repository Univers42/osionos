/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   toggleHeading.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "./types";

/** Tailwind classes that size a toggle's summary as a heading of the given
 *  level (shared by the editable and read-only toggle renderers). */
export function getToggleHeadingClass(headingLevel: Block["headingLevel"]): string {
  switch (headingLevel) {
    case 1:
      return "text-2xl font-bold";
    case 2:
      return "text-xl font-semibold";
    case 3:
      return "text-lg font-semibold";
    case 4:
      return "text-base font-semibold";
    case 5:
    case 6:
      return "text-sm font-semibold";
    default:
      return "text-sm";
  }
}
