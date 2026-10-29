/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmbedAppView.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { isWhiteboardFrameUrl, useHydrawnHost } from "@/features/whiteboard/model/useHydrawnHost";

interface Props {
  /** Already validated with `embeddableUrl`: this component trusts it. */
  url: string;
  title: string;
  /** False while a parent drags a resize grip: a cross-origin iframe swallows the
   *  pointer events, so the drag would stop at the frame's edge. */
  interactive?: boolean;
}

/** How long the iframe may stay blank before the pane says so. A cross-origin frame
 *  reports neither its status code nor a reliable `error` event, and a probe `fetch`
 *  would only trade a silent failure for browser network noise in the console. So the
 *  signal used here is the one the embedder is actually allowed to observe: whether
 *  `load` fired at all.
 *
 *  Ponytail: the window covers the FIRST document only. A navigation the user makes
 *  inside the frame (opening a board from the Whiteboard list) is invisible to the
 *  embedder, so a second document that hangs shows the stale first one rather than this
 *  message. Under-reporting, deliberately: the alternative re-arms a deadline on every
 *  `load` and declares a working pane dead, which is the bug this comment replaces. */
const LOAD_GRACE_MS = 8000;

const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";
// Devil C600: hydrawn holds a whiteboard token, so its frame opens no popups at all.
const WHITEBOARD_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads";

/** The sandboxed iframe plus the "not responding" message its stall timer lays over it.
 *  The frame stays rendered under the message: a hidden (display:none) frame is one some
 *  browsers stop loading, so a slow board could never answer. Its `load` lifts the message.
 *  Shared by the pane view and the inline whiteboard block. */
export const EmbedFrame: React.FC<Props> = ({ url, title, interactive = true }) => {
  const [stalled, setStalled] = React.useState(false);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  useHydrawnHost(frameRef, url);
  // A ref, not state: the timer below reads it after the fact, and re-rendering on
  // `load` would only re-run an effect that must not restart its own deadline.
  const hasLoaded = React.useRef(false);

  React.useEffect(() => {
    hasLoaded.current = false;
    setStalled(false);
    const timer = globalThis.setTimeout(() => {
      if (!hasLoaded.current) {
        setStalled(true);
      }
    }, LOAD_GRACE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [url]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {stalled ? (
        <div
          data-testid="embed-unavailable"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--osio-bg-page)] px-6 text-center"
        >
          <span className="text-sm font-semibold text-[var(--osio-fg-default)]">
            {title} is not responding
          </span>
          <span className="max-w-md text-xs text-[var(--osio-fg-subtle)]">
            Nothing answered at {url}. The service may still be starting, or it may not be
            running. The rest of osionos is unaffected.
          </span>
        </div>
      ) : null}
      <iframe
        ref={frameRef}
        src={url}
        title={title}
        onLoad={() => {
          hasLoaded.current = true;
          setStalled(false);
        }}
        style={interactive ? undefined : { pointerEvents: "none" }}
        className="h-full w-full flex-1 border-0 bg-[var(--osio-bg-page)]"
        sandbox={isWhiteboardFrameUrl(url) ? WHITEBOARD_SANDBOX : SANDBOX}
      />
    </div>
  );
};
