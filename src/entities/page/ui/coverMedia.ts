/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverMedia.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page cover is an opaque string end-to-end (store → outbox → bridge → DB),
// so video covers need zero schema change: any URL whose path ends in a video
// extension renders as a muted looping <video> instead of an <img>.

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)$/i;

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

/** Respect the OS "reduce motion" preference: video covers stay on frame 1. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
