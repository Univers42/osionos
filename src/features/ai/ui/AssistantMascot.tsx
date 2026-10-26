/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AssistantMascot.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";

import { useChatStore } from "@/features/chat/model/useChatStore";
import { BinocleMascot } from "@/shared/ui/mascot/BinocleMascot";
import { eyeOffset, hasPermissionPart, mascotMoodFor, HAPPY_MS, SLEEP_MS } from "../model/mascotMood";

interface Props {
  size?: number;
  /** True while the user is typing a message. */
  typing?: boolean;
  /** The pupils follow the pointer, when motion is allowed. */
  followPointer?: boolean;
  className?: string;
}

/** Pupil travel in SVG units: the lens is 28 wide, the pupil 11 in radius. */
const MAX_LOOK = 5;

/**
 * The binocle, wired to the active conversation.
 *
 * One timer keeps `idleMs`: it is re-armed on every change of the last
 * answer, and fires at the next moment the mood can change (the end of the
 * happy window, then the sleep threshold).
 */
export const AssistantMascot: React.FC<Props> = ({ size = 112, typing = false, followPointer = false, className }) => {
  const last = useChatStore((s) => {
    for (let index = s.messages.length - 1; index >= 0; index -= 1) {
      const message = s.messages[index];
      if (message.conversationId === s.activeConversationId && message.role === "assistant") return message;
    }
    return undefined;
  });
  const [aged, setAged] = useState({ key: "", idleMs: 0 });
  const rootRef = useRef<SVGSVGElement | null>(null);
  const status = last?.status;
  const awaitingApproval = hasPermissionPart(last?.parts);
  // A state keyed by the change it measures: a new change reads as idle 0
  // without a synchronous setState in the effect.
  const key = `${last?.id}|${status}|${awaitingApproval}|${typing}`;
  const idleMs = aged.key === key ? aged.idleMs : 0;

  useEffect(() => {
    // One live timer at a time: the happy window ends first, then the sleep
    // threshold is reached from the same handle.
    let handle = globalThis.setTimeout(() => {
      setAged({ key, idleMs: HAPPY_MS });
      handle = globalThis.setTimeout(() => setAged({ key, idleMs: SLEEP_MS }), SLEEP_MS - HAPPY_MS);
    }, HAPPY_MS);
    return () => globalThis.clearTimeout(handle);
  }, [key]);

  useEffect(() => {
    if (!followPointer || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    let latest = { x: 0, y: 0 };
    const apply = () => {
      frame = 0;
      const root = rootRef.current;
      if (!root) return;
      const offset = eyeOffset(latest, root.getBoundingClientRect(), MAX_LOOK);
      root.style.setProperty("--look-x", `${offset.x.toFixed(2)}px`);
      root.style.setProperty("--look-y", `${offset.y.toFixed(2)}px`);
    };
    const onMove = (event: PointerEvent) => {
      latest = { x: event.clientX, y: event.clientY };
      if (frame === 0) frame = globalThis.requestAnimationFrame(apply);
    };
    globalThis.addEventListener("pointermove", onMove);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      if (frame !== 0) globalThis.cancelAnimationFrame(frame);
    };
  }, [followPointer]);

  const mood = mascotMoodFor({ typing, lastAssistant: last ? { status, awaitingApproval } : undefined, idleMs });
  return <BinocleMascot ref={rootRef} mood={mood} size={size} className={className} />;
};
