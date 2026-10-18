/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmbedView.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef } from "react";

import { useHasBeenNearViewport } from "@/shared/lib/dom/useHasBeenNearViewport";
import { DEFAULT_EMBED_HEIGHT, appForbiddenOrigins, type EmbedSnapshot } from "@/shared/lib/embed";

import { EmbedFooter } from "./EmbedFooter";
import { LinkCard } from "./LinkCard";
import { PlayerFacade } from "./PlayerFacade";
import { WebEmbedFrame } from "./WebEmbedFrame";
import { chooseEmbedView, type EmbedView as EmbedViewModel } from "./model/chooseEmbedView";

export interface EmbedViewProps {
  url: string;
  snapshot?: EmbedSnapshot | null;
  /** Fixed pixel height, e.g. a block the user resized. Wins over the aspect. */
  height?: number;
  /** When given, frames and refused cards offer "Show as bookmark". */
  onShowAsBookmark?: () => void;
  /** False while a parent drags a resize grip. */
  interactive?: boolean;
  /** Rendered inside a framed page's box (a resize grip); other views ignore it. */
  frameOverlay?: React.ReactNode;
}

const REASON_NOTE = { refused: "This site doesn't allow embedding", "unsafe-frame": "This link can't be embedded here", pdf: "PDFs open in their own tab" };

const MEDIA = "block max-w-full rounded-md";

function renderMedia(view: Extract<EmbedViewModel, { kind: "media" }>): React.ReactNode {
  if (view.mediaKind === "image") return <img src={view.src} alt="" loading="lazy" referrerPolicy="no-referrer" className={MEDIA} />;
  if (view.mediaKind === "audio") return <audio controls preload="none" src={view.src} className="w-full" />;
  return <video controls preload="metadata" src={view.src} className={`${MEDIA} w-full`} />;
}

/** Whatever `chooseEmbedView` decides a link is: player, framed page, media file,
 *  bookmark card or plain text. Iframes mount once the block is near the viewport. */
export const EmbedView: React.FC<EmbedViewProps> = ({ url, snapshot, height, onShowAsBookmark, interactive = true, frameOverlay }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const isNear = useHasBeenNearViewport(rootRef);
  const view = useMemo(
    () => chooseEmbedView({ url, snapshot, forbiddenOrigins: appForbiddenOrigins() }),
    [url, snapshot],
  );
  const title = snapshot?.title || url;
  let body: React.ReactNode;
  switch (view.kind) {
    case "text":
      body = <span className="break-all text-sm text-[var(--osio-fg-muted)]">{view.url}</span>;
      break;
    case "media":
      body = renderMedia(view);
      break;
    case "card":
      body = (
        <>
          <LinkCard data={view.info} />
          <EmbedFooter
            framedSrc={view.info.url}
            openUrl={view.info.url}
            note={view.reason === undefined ? undefined : REASON_NOTE[view.reason]}
            onShowAsBookmark={onShowAsBookmark}
          />
        </>
      );
      break;
    case "facade":
      body = (
        <>
          <PlayerFacade embed={view.embed} title={view.title} thumb={view.thumb} aspect={view.aspect} interactive={interactive} />
          <EmbedFooter framedSrc={view.embed.src} openUrl={url} />
        </>
      );
      break;
    case "frame":
      // `load` fires even when the site refuses to be framed (the browser shows its
      // own error page inside the frame), so a stall timer cannot tell success from
      // refusal. The footer's "Not loading? Show as bookmark" is the honest way out.
      body = (
        <>
          <WebEmbedFrame
            src={view.src}
            title={title}
            policy={view.policy}
            height={height ?? view.height ?? (view.aspect === undefined ? DEFAULT_EMBED_HEIGHT : undefined)}
            aspect={view.aspect}
            interactive={interactive}
            isActive={isNear}
          >
            {frameOverlay}
          </WebEmbedFrame>
          <EmbedFooter
            framedSrc={view.src}
            openUrl={url}
            bookmarkLabel={view.policy === "generic" ? "Not loading? Show as bookmark" : "Show as bookmark"}
            onShowAsBookmark={onShowAsBookmark}
          />
        </>
      );
      break;
  }
  return <div ref={rootRef} className="w-full">{body}</div>;
};
