/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CoverMediaElement.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { useAnimatedImagesMode } from "@/shared/config/useAppearance";
import { animatedMediaMayPlay, isVideoCoverSource, usePrefersReducedMotion } from "./coverMedia";

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

interface VideoCoverProps {
  src: string;
  style: React.CSSProperties;
  /** Whether the cover may animate on its own. */
  mayPlay: boolean;
  attachMedia: (el: HTMLElement | null) => void;
  handlers: CoverPointerHandlers;
}

/**
 * A video cover. When it may play, it plays: muted, looped, autoplaying —
 * a video cover is user-chosen ambient motion. When it may not (the person
 * chose "still", or the OS asks for reduced motion), it shows its first frame
 * and offers a play/pause button instead, so the motion is theirs to start.
 */
const VideoCover: React.FC<VideoCoverProps> = ({ src, style, mayPlay, attachMedia, handlers }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // The ref also kicks play() imperatively: React sets `muted` as a property
  // only (no DOM attribute), which some autoplay policies evaluate too late.
  const attachVideo = (el: HTMLVideoElement | null) => {
    attachMedia(el);
    videoRef.current = el;
    if (!el) return;
    el.defaultMuted = true;
    el.muted = true;
    if (mayPlay) void el.play().catch(() => {});
  };

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div className="relative h-full w-full">
      <video
        ref={attachVideo}
        src={src}
        data-testid="page-cover-video"
        className="osionos-page-cover-img"
        style={style}
        muted
        loop
        playsInline
        autoPlay={mayPlay}
        preload={mayPlay ? "auto" : "metadata"}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedData={(event) => { if (mayPlay) void event.currentTarget.play().catch(() => {}); }}
        {...handlers}
      />
      {mayPlay ? null : (
        <button
          type="button"
          data-testid="page-cover-video-toggle"
          aria-label={playing ? "Pause cover video" : "Play cover video"}
          aria-pressed={playing}
          onClick={toggle}
          className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-[var(--osio-radius-control)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-sm)]"
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          {playing ? "Pause" : "Play"}
        </button>
      )}
    </div>
  );
};

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
  const animatedImages = useAnimatedImagesMode();
  const reducedMotion = usePrefersReducedMotion();

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

  if (src && isVideoCoverSource(src)) {
    return (
      <VideoCover
        src={src}
        style={style}
        mayPlay={animatedMediaMayPlay(animatedImages, reducedMotion)}
        attachMedia={attachMedia}
        handlers={handlers}
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
