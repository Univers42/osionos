/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasStage.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { getCellsOrderedByZ, getContentExtent } from "../model/selectors";
import type { CanvasCell } from "../model/types";
import { CanvasCellView } from "./CanvasCellView";

export interface CanvasStageProps {
  readonly cells: CanvasCell[];
  readonly selectedIds: string[];
  readonly onSelect?: (cellId: string) => void;
}

export function CanvasStage({ cells, selectedIds, onSelect }: CanvasStageProps) {
  const selected = new Set(selectedIds);
  const extent = getContentExtent(cells);
  return (
    <div className="osio-canvas-v2-stage" style={{ width: extent.width, height: extent.height }}>
      {getCellsOrderedByZ(cells).map((cell) => (
        <CanvasCellView key={cell.id} cell={cell} selected={selected.has(cell.id)} onSelect={onSelect} />
      ))}
    </div>
  );
}
