/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WebEmbedFrame.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import {
  DEFAULT_EMBED_ASPECT,
  EMBED_REFERRER_POLICY,
  GENERIC_ALLOW,
  PROVIDER_ALLOW,
  THIRD_PARTY_SANDBOX,
  appForbiddenOrigins,
  clampEmbedHeight,
  frameableEmbedUrl,
  safeAspect,
} from "@/shared/lib/embed";

export interface WebEmbedFrameProps {
  src: string;
  title: string;
  /** Which `allow` list: the provider table's players or anything else. */
  policy: "provider" | "generic";
  /** Fixed pixel height (clamped). Wins over `aspect`. */
  height?: number;
  aspect?: string;
  /** False while a parent drags a resize grip: a cross-origin iframe swallows pointer events. */
  interactive?: boolean;
  /** False renders only the sized, empty box (not near the viewport yet). */
  isActive?: boolean;
  /** Drawn over the frame's box, e.g. a resize grip anchored to its bottom edge. */
  children?: React.ReactNode;
}

/** The one third-party iframe. Third-party only: first-party apps use
 *  `widgets/embed-app/ui/EmbedFrame`, which has a different sandbox on purpose. It
 *  validates its own `src` because it is the last line before the browser: a caller
 *  that forgot to is not able to frame the app's own origin or a `javascript:` URL. */
export const WebEmbedFrame: React.FC<WebEmbedFrameProps> = ({
  src, title, policy, height, aspect, interactive = true, isActive = true, children,
}) => {
  const safeSrc = frameableEmbedUrl(src, appForbiddenOrigins());
  if (safeSrc === "") return <span className="break-all text-sm text-[var(--osio-fg-muted)]">{src}</span>;
  const boxStyle: React.CSSProperties =
    height === undefined ? { aspectRatio: safeAspect(aspect ?? DEFAULT_EMBED_ASPECT) } : { height: clampEmbedHeight(height) };
  return (
    <div style={boxStyle} className="relative w-full overflow-hidden rounded-md bg-[var(--osio-bg-subtle)]">
      {isActive ? (
        <iframe
          src={safeSrc}
          title={title}
          sandbox={THIRD_PARTY_SANDBOX}
          allow={policy === "provider" ? PROVIDER_ALLOW : GENERIC_ALLOW}
          allowFullScreen
          referrerPolicy={EMBED_REFERRER_POLICY}
          loading="lazy"
          style={interactive ? undefined : { pointerEvents: "none" }}
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : null}
      {children}
    </div>
  );
};
