/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CoverMediaElement.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { isVideoCoverSource } from "./coverMedia";

interface CoverPointerHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
}

interface CoverMediaElementProps {
  /** Raw cover value (used verbatim for gradients). */
  cover: string;
  /** Normalized media URL when the cover is not a gradient. */
  src?: string;
  isGradient: boolean;
  /** Vertical focal point (%) — rendered as `object-position: center n%`. */
  position: number;
  /** Callback ref from useCoverReposition (direct-DOM drag painting). */
  attachMedia: (el: HTMLElement | null) => void;
  handlers: CoverPointerHandlers;
}

/**
 * The cover media itself: CSS gradient, muted looping <video>, or <img>.
 * Reposition works identically for image and video (both are object-fit:
 * cover boxes whose focal point is `object-position`).
 */
export const CoverMediaElement: React.FC<CoverMediaElementProps> = ({
  cover,
  src,
  isGradient,
  position,
  attachMedia,
  handlers,
}) => {
  if (isGradient) {
    return (
      <div
        data-testid="page-cover-gradient"
        className="osionos-page-cover-gradient"
        style={{ background: cover }}
      />
    );
  }

  const style = { objectPosition: `center ${position}%` };

  if (isVideoCoverSource(src)) {
    // A video cover is user-chosen ambient motion (always muted+looped), so it
    // plays even under prefers-reduced-motion — on this stack that media query
    // is often just GTK "animations off" (gtk-enable-animations=false), which
    // would otherwise freeze every cover on frame 1. The ref also kicks play()
    // imperatively: React sets `muted` as a property only (no DOM attribute),
    // which some autoplay policies evaluate too late.
    const attachVideo = (el: HTMLVideoElement | null) => {
      attachMedia(el);
      if (el) {
        el.defaultMuted = true;
        el.muted = true;
        void el.play().catch(() => {});
      }
    };
    return (
      <video
        ref={attachVideo}
        src={src}
        data-testid="page-cover-video"
        className="osionos-page-cover-img"
        style={style}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        onLoadedData={(event) => { void event.currentTarget.play().catch(() => {}); }}
        {...handlers}
      />
    );
  }

  return (
    <img
      ref={attachMedia}
      src={src}
      alt=""
      data-testid="page-cover-image"
      className="osionos-page-cover-img"
      style={style}
      draggable={false}
      {...handlers}
    />
  );
};
