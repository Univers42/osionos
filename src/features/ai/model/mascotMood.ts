/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mascotMood.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the binocle feels, from what the assistant is doing.
 *
 * Pure: the wrapper feeds it the store and the clock, the tests feed it
 * literals. Rules, first match wins: an error surprises it, a write waiting for
 * the user's approval makes it shy, a streaming answer makes it think, typing
 * makes it listen, a fresh answer makes it happy, a long silence puts it to
 * sleep.
 *
 * Caveat: "awaiting approval" is the PRESENCE of a permission part on the last
 * answer. The part does not record the decision (the card asks the service),
 * so a decided card still reads as shy until the next message; the mood is
 * decoration, so the error is cosmetic.
 */

import type { BinocleMood } from "@/shared/ui/mascot/BinocleMascot";

export interface MascotMoodInput {
  typing: boolean;
  lastAssistant?: { status?: "streaming" | "done" | "error"; awaitingApproval?: boolean };
  /** Milliseconds since the last change the mascot reacts to. */
  idleMs: number;
}

/** How long a finished answer keeps the mascot happy. */
export const HAPPY_MS = 4_000;
/** How long without any change before the mascot falls asleep. */
export const SLEEP_MS = 120_000;

export function mascotMoodFor({ typing, lastAssistant, idleMs }: MascotMoodInput): BinocleMood {
  if (lastAssistant?.status === "error") return "surprised";
  if (lastAssistant?.awaitingApproval) return "shy";
  if (lastAssistant?.status === "streaming") return "thinking";
  if (typing) return "listening";
  if (lastAssistant?.status === "done" && idleMs < HAPPY_MS) return "happy";
  if (idleMs >= SLEEP_MS) return "sleeping";
  return "curious";
}

export interface Point {
  x: number;
  y: number;
}

export interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How far the pupils move toward the pointer: the vector from the centre of
 * the box to the pointer, cut at `max` px. The centre gives exactly 0,0.
 */
export function eyeOffset(pointer: Point, rect: BoxRect, max: number): Point {
  const dx = pointer.x - (rect.left + rect.width / 2);
  const dy = pointer.y - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const reach = Math.min(distance, max);
  return { x: (dx / distance) * reach, y: (dy / distance) * reach };
}

/** Reads the parts of a message for a write waiting on the user. */
export function hasPermissionPart(parts: ReadonlyArray<{ type: string }> | undefined): boolean {
  return parts?.some((part) => part.type === "permission") ?? false;
}
