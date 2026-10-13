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

/** Classes that set a toggle's summary like a heading of the given level, shared
 *  by the editable and read-only renderers. Levels 1-4 use the heading
 *  utilities, which already carry the line height: callers must not add a
 *  `leading-*` of their own next to them. Levels 5-6 are too small for a
 *  heading and stay UI text, so they carry the line height themselves. */
export function getToggleHeadingClass(headingLevel: Block["headingLevel"]): string {
  switch (headingLevel) {
    case 1:
      return "osio-h1";
    case 2:
      return "osio-h2";
    case 3:
      return "osio-h3";
    case 4:
      return "osio-h4";
    case 5:
    case 6:
      return "text-sm font-semibold leading-relaxed";
    default:
      return "text-sm leading-relaxed";
  }
}
