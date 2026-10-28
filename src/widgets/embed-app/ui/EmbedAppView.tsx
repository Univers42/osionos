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

import { isWhiteboardFrameUrl } from "@/features/whiteboard/model/useHydrawnHost";

import { embeddableUrl } from "../model/embeddableUrl";
import { EmbedFrame } from "./EmbedFrame";

interface Props {
  url: string;
  title: string;
}

/**
 * Hosts a separate osionos app (Mail / Calendar / Whiteboard) inside a pane via a
 * sandboxed iframe. Some apps block framing (X-Frame-Options/CSP) and some are simply
 * not running — the header offers an "Open externally" escape hatch, and a frame that never
 * loads degrades to a readable message instead of an empty pane. Hydrawn gets no escape
 * hatch: it is given its token by this page, so opened on its own it cannot load a board.
 */
export const EmbedAppView: React.FC<Props> = ({ url: rawUrl, title }) => {
  const url = embeddableUrl(rawUrl);

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--osio-fg-subtle)]">
        {rawUrl.trim() ? `${title} cannot open in a pane: only http and https addresses can.` : `No URL configured for ${title}.`}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-1.5">
        <span className="text-xs font-semibold text-[var(--osio-fg-default)]">{title}</span>
        {isWhiteboardFrameUrl(url) ? null : (
          <button
            type="button"
            onClick={() => globalThis.open(url, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          >
            Open externally <ExternalLink size={12} />
          </button>
        )}
      </div>
      <EmbedFrame url={url} title={title} />
    </div>
  );
};
