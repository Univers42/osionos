import type { CanvasCell, CanvasFrame } from "./types";

export function applyConstraints(cell: CanvasCell, _oldParentFrame: CanvasFrame, _newParentFrame: CanvasFrame): CanvasCell {
  // Phase 2: resize according to min/max/scale/hug constraints.
  return cell;
}
