/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverMedia.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page cover is an opaque string end-to-end (store → outbox → bridge → DB),
// so video covers need zero schema change: any URL whose path ends in a video
// extension renders as a muted looping <video> instead of an <img>.

import { useSyncExternalStore } from "react";

import { subscribeAppearance, type AnimatedImages } from "@/shared/config/theme";

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)$/i;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when a cover source should render as a (muted, looping) video. */
export function isVideoCoverSource(value: string | undefined): boolean {
  if (!value) return false;
  const src = value.startsWith("url:") ? value.slice(4) : value;
  if (src.startsWith("data:video/")) return true;
  try {
    return VIDEO_EXT_RE.test(new URL(src, "https://local").pathname);
  } catch {
    return VIDEO_EXT_RE.test(src.split(/[?#]/, 1)[0] ?? "");
  }
}

/**
 * Whether the motion must be reduced right now: the person's own choice first
 * (data-motion on <html>), the OS second.
 *
 * Caveat: the vendored readers (notion-database-sys's useViewTabReorder.ts and
 * ViewSlideStage.tsx) and packages/legacy-graph-engine read the OS media query
 * on their own — they keep following the OS alone, so a person who chose
 * "reduce" still sees those transitions move.
 */
export function prefersReducedMotion(): boolean {
  const motion = typeof document === "undefined" ? undefined : document.documentElement.dataset.motion;
  if (motion === "reduce") return true;
  if (motion === "full") return false;
  return typeof window !== "undefined" && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}

function subscribeMotion(listener: () => void): () => void {
  const stopAppearance = subscribeAppearance(listener);
  if (typeof window === "undefined") return stopAppearance;
  const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!query) return stopAppearance;
  query.addEventListener("change", listener);
  return () => {
    query.removeEventListener("change", listener);
    stopAppearance();
  };
}

/** The same answer as prefersReducedMotion(), but live: the reader re-renders
 *  when the OS setting changes or when the person changes their own choice. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => false);
}

/** Whether animated media may play: "play" always, "still" never, "system"
 *  follows the motion choice. */
export function animatedMediaMayPlay(mode: AnimatedImages, reducedMotion: boolean): boolean {
  if (mode === "still") return false;
  if (mode === "system") return !reducedMotion;
  return true;
}
