/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   geometry.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CanvasFrame } from "./types";

export function right(frame: CanvasFrame): number {
  return frame.x + frame.width;
}

export function bottom(frame: CanvasFrame): number {
  return frame.y + frame.height;
}

export function centerX(frame: CanvasFrame): number {
  return frame.x + frame.width / 2;
}

export function centerY(frame: CanvasFrame): number {
  return frame.y + frame.height / 2;
}

export function framesIntersect(left: CanvasFrame, rightFrame: CanvasFrame): boolean {
  return left.x < right(rightFrame) && right(left) > rightFrame.x && left.y < bottom(rightFrame) && bottom(left) > rightFrame.y;
}

export function containsPoint(frame: CanvasFrame, point: { x: number; y: number }): boolean {
  return point.x >= frame.x && point.x <= right(frame) && point.y >= frame.y && point.y <= bottom(frame);
}

export function translateFrame(frame: CanvasFrame, delta: { x: number; y: number }): CanvasFrame {
  return { ...frame, x: frame.x + delta.x, y: frame.y + delta.y };
}

export function clampFrameSize(frame: CanvasFrame, minSize = 1): CanvasFrame {
  return { ...frame, width: Math.max(minSize, frame.width), height: Math.max(minSize, frame.height) };
}

export function unionFrames(frames: CanvasFrame[]): CanvasFrame {
  if (frames.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...frames.map((frame) => frame.x));
  const minY = Math.min(...frames.map((frame) => frame.y));
  const maxX = Math.max(...frames.map(right));
  const maxY = Math.max(...frames.map(bottom));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function roundFrameForDom(frame: CanvasFrame): CanvasFrame {
  return {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: Math.round(frame.width),
    height: Math.round(frame.height),
  };
}

export function frameEquals(left: CanvasFrame, rightFrame: CanvasFrame, epsilon = 0.001): boolean {
  return Math.abs(left.x - rightFrame.x) <= epsilon &&
    Math.abs(left.y - rightFrame.y) <= epsilon &&
    Math.abs(left.width - rightFrame.width) <= epsilon &&
    Math.abs(left.height - rightFrame.height) <= epsilon;
}
