import { bottom, centerX, centerY, right } from "./geometry";
import type { CanvasCell, CanvasFrame } from "./types";

export interface SnapGuide {
  axis: "x" | "y";
  value: number;
  kind: "edge" | "center" | "spacing";
}

export interface SnapResult {
  frame: CanvasFrame;
  guides: SnapGuide[];
}

export interface SnapOptions {
  zoom: number;
  thresholdPx: number;
}

interface Target {
  axis: "x" | "y";
  value: number;
  kind: SnapGuide["kind"];
}

export function screenThresholdToCanvas(thresholdPx: number, zoom: number): number {
  return thresholdPx / Math.max(zoom, 0.01);
}

export function collectSnapTargets(cells: CanvasCell[], excludedIds = new Set<string>()): Target[] {
  return cells.flatMap((cell) => excludedIds.has(cell.id) ? [] : [
    { axis: "x", value: cell.frame.x, kind: "edge" },
    { axis: "x", value: centerX(cell.frame), kind: "center" },
    { axis: "x", value: right(cell.frame), kind: "edge" },
    { axis: "y", value: cell.frame.y, kind: "edge" },
    { axis: "y", value: centerY(cell.frame), kind: "center" },
    { axis: "y", value: bottom(cell.frame), kind: "edge" },
  ]);
}

export function snapFrameToTargets(frame: CanvasFrame, targets: Target[], options: SnapOptions): SnapResult {
  const threshold = screenThresholdToCanvas(options.thresholdPx, options.zoom);
  const xCandidates = [frame.x, centerX(frame), right(frame)];
  const yCandidates = [frame.y, centerY(frame), bottom(frame)];
  const xSnap = bestSnapDelta(xCandidates, targets.filter((target) => target.axis === "x"), threshold);
  const ySnap = bestSnapDelta(yCandidates, targets.filter((target) => target.axis === "y"), threshold);
  return {
    frame: { ...frame, x: frame.x + xSnap.delta, y: frame.y + ySnap.delta },
    guides: [...xSnap.guides, ...ySnap.guides],
  };
}

export function snapFrameToCells(frame: CanvasFrame, cells: CanvasCell[], options: SnapOptions, excludedIds = new Set<string>()): SnapResult {
  const targets = [...collectSnapTargets(cells, excludedIds), ...collectSpacingTargets(frame, cells, excludedIds)];
  return snapFrameToTargets(frame, targets, options);
}

function bestSnapDelta(values: number[], targets: Target[], threshold: number): { delta: number; guides: SnapGuide[] } {
  let best: { delta: number; distance: number; guide: SnapGuide } | null = null;
  for (const value of values) {
    for (const target of targets) {
      const delta = target.value - value;
      const distance = Math.abs(delta);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { delta, distance, guide: target };
      }
    }
  }
  return best ? { delta: best.delta, guides: [best.guide] } : { delta: 0, guides: [] };
}

function collectSpacingTargets(frame: CanvasFrame, cells: CanvasCell[], excludedIds: Set<string>): Target[] {
  const stableCells = cells.filter((cell) => !excludedIds.has(cell.id));
  const leftNeighbor = stableCells.filter((cell) => right(cell.frame) <= frame.x).sort((a, b) => right(b.frame) - right(a.frame))[0];
  const rightNeighbor = stableCells.filter((cell) => cell.frame.x >= right(frame)).sort((a, b) => a.frame.x - b.frame.x)[0];
  const topNeighbor = stableCells.filter((cell) => bottom(cell.frame) <= frame.y).sort((a, b) => bottom(b.frame) - bottom(a.frame))[0];
  const bottomNeighbor = stableCells.filter((cell) => cell.frame.y >= bottom(frame)).sort((a, b) => a.frame.y - b.frame.y)[0];
  const targets: Target[] = [];
  if (leftNeighbor && rightNeighbor) targets.push({ axis: "x", value: right(leftNeighbor.frame) + (rightNeighbor.frame.x - right(leftNeighbor.frame) - frame.width) / 2, kind: "spacing" });
  if (topNeighbor && bottomNeighbor) targets.push({ axis: "y", value: bottom(topNeighbor.frame) + (bottomNeighbor.frame.y - bottom(topNeighbor.frame) - frame.height) / 2, kind: "spacing" });
  return targets;
}
