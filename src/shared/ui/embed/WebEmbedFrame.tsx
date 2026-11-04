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

import { frameAllow } from "@/shared/lib/dom/frameAllow";

import {
  DEFAULT_EMBED_ASPECT,
  EMBED_REFERRER_POLICY,
  THIRD_PARTY_SANDBOX,
  allowForPolicy,
  appForbiddenOrigins,
  aspectBoxStyle,
  clampEmbedHeight,
  frameableEmbedUrl,
  grantsFullscreen,
  type FramePolicy,
} from "@/shared/lib/embed";

export interface WebEmbedFrameProps {
  src: string;
  title: string;
  /** Which `allow` list, and whether the frame may go fullscreen. */
  policy: FramePolicy;
  /** Fixed pixel height (clamped). Wins over `aspect`. */
  height?: number;
  aspect?: string;
  /** False renders only the sized, empty box (not near the viewport yet). */
  isActive?: boolean;
}

/** The one third-party iframe. Third-party only: first-party apps use
 *  `widgets/embed-app/ui/EmbedFrame`, which has a different sandbox on purpose. It
 *  validates its own `src` because it is the last line before the browser: a caller
 *  that forgot to is not able to frame the app's own origin or a `javascript:` URL. */
export const WebEmbedFrame: React.FC<WebEmbedFrameProps> = ({
  src, title, policy, height, aspect, isActive = true,
}) => {
  const safeSrc = frameableEmbedUrl(src, appForbiddenOrigins());
  if (safeSrc === "") return <span className="break-all text-sm text-[var(--osio-fg-muted)]">{src}</span>;
  const boxStyle: React.CSSProperties =
    height === undefined ? aspectBoxStyle(aspect ?? DEFAULT_EMBED_ASPECT) : { height: clampEmbedHeight(height) };
  return (
    <div data-embed-frame-box style={boxStyle} className="relative w-full overflow-hidden rounded-md bg-[var(--osio-bg-subtle)]">
      {isActive ? (
        <iframe
          src={safeSrc}
          title={title}
          sandbox={THIRD_PARTY_SANDBOX}
          allow={frameAllow(allowForPolicy(policy))}
          allowFullScreen={grantsFullscreen(policy)}
          referrerPolicy={EMBED_REFERRER_POLICY}
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : null}
    </div>
  );
};
