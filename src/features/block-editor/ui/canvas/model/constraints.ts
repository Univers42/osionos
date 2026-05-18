/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   constraints.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CanvasCell, CanvasFrame } from "./types";

export function applyConstraints(cell: CanvasCell, _oldParentFrame: CanvasFrame, _newParentFrame: CanvasFrame): CanvasCell {
  // Phase 2: resize according to min/max/scale/hug constraints.
  return cell;
}
