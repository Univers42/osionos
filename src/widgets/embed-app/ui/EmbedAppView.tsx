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
import { ExternalLink } from "lucide-react";

interface Props {
  url: string;
  title: string;
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

/**
 * Hosts a separate osionos app (Mail / Calendar / Whiteboard) inside a pane via a
 * sandboxed iframe. Some apps block framing (X-Frame-Options/CSP) and some are simply
 * not running — the header always offers an "Open externally" escape hatch, and a frame
 * that never loads degrades to a readable message instead of an empty pane.
 */
export const EmbedAppView: React.FC<Props> = ({ url, title }) => {
  const [stalled, setStalled] = React.useState(false);
  // A ref, not state: the timer below reads it after the fact, and re-rendering on
  // `load` would only re-run an effect that must not restart its own deadline.
  const hasLoaded = React.useRef(false);

  React.useEffect(() => {
    if (!url) {
      return undefined;
    }
    hasLoaded.current = false;
    setStalled(false);
    const timer = globalThis.setTimeout(() => {
      if (!hasLoaded.current) {
        setStalled(true);
      }
    }, LOAD_GRACE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [url]);

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--osio-fg-subtle)]">
        No URL configured for {title}.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-1.5">
        <span className="text-xs font-semibold text-[var(--osio-fg-default)]">{title}</span>
        <button
          type="button"
          onClick={() => globalThis.open(url, "_blank", "noopener,noreferrer")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          Open externally <ExternalLink size={12} />
        </button>
      </div>
      {stalled ? (
        <div
          data-testid="embed-unavailable"
          className="flex h-full flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
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
        src={url}
        title={title}
        onLoad={() => {
          hasLoaded.current = true;
          setStalled(false);
        }}
        className={`w-full flex-1 border-0 bg-[var(--osio-bg-page)] ${stalled ? "hidden" : "h-full"}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
      />
    </div>
  );
};
