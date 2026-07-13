/**
 * Vector (SVG) export. Pure string generation — node-tested. Shapes export as
 * clean SVG primitives (the hand-drawn roughjs look is canvas/PNG only for now;
 * rough-SVG is a later refinement). Elements are shifted so the content sits at
 * `padding` from the top-left.
 */

import type { WorldBounds } from "../camera/transform";
import type { Arrowhead, DrawElement } from "../scene/element";
import { normalizeRect } from "../scene/geometry";
import { linearEndpoints } from "../scene/binding";
import { defaultArrowhead } from "../render/arrowheads";

const DASH: Record<DrawElement["strokeStyle"], string> = {
  solid: "",
  dashed: ' stroke-dasharray="8 6"',
  dotted: ' stroke-dasharray="2 4"',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);
}

/** A line/arrow: the shaft plus a polygon/path per chosen extremity. */
function linearSvg(element: DrawElement): string {
  const { start, end } = linearEndpoints(element);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return "";
  const angle = Math.atan2(dy, dx);
  const size = Math.max(14, element.strokeWidth * 4);
  const opacity = element.opacity / 100;
  const shaft =
    `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${element.strokeColor}" ` +
    `stroke-width="${element.strokeWidth}" stroke-linecap="round" fill="none" opacity="${opacity}"${DASH[element.strokeStyle] ?? ""}/>`;
  return [
    shaft,
    headSvg(defaultArrowhead(element, "end"), end, angle, element, size, opacity),
    headSvg(defaultArrowhead(element, "start"), start, angle + Math.PI, element, size, opacity),
  ].join("");
}

/** One extremity, rotated into place about its tip. */
function headSvg(
  kind: Arrowhead,
  tip: { x: number; y: number },
  angle: number,
  element: DrawElement,
  size: number,
  opacity: number,
): string {
  if (kind === "none") return "";
  const rotate = ` transform="rotate(${(angle * 180) / Math.PI} ${tip.x} ${tip.y}) translate(${tip.x} ${tip.y})"`;
  const stroke = `stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" opacity="${opacity}"`;
  const solid = `fill="${element.strokeColor}" opacity="${opacity}"`;
  switch (kind) {
    case "arrow": {
      const spread = Math.PI / 7;
      const bx = -size * Math.cos(spread);
      const by = size * Math.sin(spread);
      return `<polyline points="${bx},${-by} 0,0 ${bx},${by}" fill="none" ${stroke}${rotate}/>`;
    }
    case "triangle":
      return `<polygon points="0,0 ${-size},${-size * 0.42} ${-size},${size * 0.42}" ${solid}${rotate}/>`;
    case "diamond":
      return `<polygon points="0,0 ${-size * 0.5},${-size * 0.42} ${-size},0 ${-size * 0.5},${size * 0.42}" ${solid}${rotate}/>`;
    case "dot":
      return `<circle cx="${-size * 0.3}" cy="0" r="${size * 0.32}" ${solid}${rotate}/>`;
    case "bar":
      return `<line x1="0" y1="${-size * 0.5}" x2="0" y2="${size * 0.5}" fill="none" ${stroke}${rotate}/>`;
    default:
      return "";
  }
}

function elementSvg(element: DrawElement): string {
  const { x, y, width, height } = normalizeRect(element.x, element.y, element.width, element.height);
  const fill = element.backgroundColor && element.backgroundColor !== "transparent" ? element.backgroundColor : "none";
  const common = `stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" fill="${fill}" opacity="${element.opacity / 100}"`;
  const dash = DASH[element.strokeStyle] ?? "";
  const transform = element.angle ? ` transform="rotate(${(element.angle * 180) / Math.PI} ${x + width / 2} ${y + height / 2})"` : "";

  switch (element.type) {
    case "line":
    case "arrow":
      return linearSvg(element);
    case "ellipse":
      return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" ${common}${dash}${transform}/>`;
    case "diamond":
      return `<polygon points="${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}" ${common}${dash}${transform}/>`;
    case "freedraw": {
      const pts = (element.points ?? []).map(([px, py]) => `${x + px},${y + py}`).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" opacity="${element.opacity / 100}"/>`;
    }
    case "text": {
      const fontSize = element.fontSize ?? 20;
      const lines = (element.text ?? "").split("\n");
      const spans = lines
        .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? fontSize * 0.85 : fontSize * 1.25}">${escapeXml(line)}</tspan>`)
        .join("");
      return `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${fontSize}" fill="${element.strokeColor}" opacity="${element.opacity / 100}"${transform}>${spans}</text>`;
    }
    default: {
      const radius = element.roundness ?? 0;
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ${common}${dash}${transform}/>`;
    }
  }
}

export function sceneToSvg(elements: readonly DrawElement[], bounds: WorldBounds, padding = 16, background = "#ffffff"): string {
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const dx = padding - bounds.minX;
  const dy = padding - bounds.minY;
  const body = elements
    .filter((element) => !element.isDeleted)
    .map(elementSvg)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/><g transform="translate(${dx} ${dy})">${body}</g></svg>`;
}
