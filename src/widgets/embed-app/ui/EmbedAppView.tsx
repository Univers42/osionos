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

/**
 * Hosts a separate osionos app (Mail / Calendar) inside a pane via a sandboxed
 * iframe. Some apps block framing (X-Frame-Options/CSP) — the header always
 * offers an "Open externally" escape hatch so the destination stays reachable.
 */
export const EmbedAppView: React.FC<Props> = ({ url, title }) => {
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
      <iframe
        src={url}
        title={title}
        className="h-full w-full flex-1 border-0 bg-[var(--osio-bg-page)]"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
      />
    </div>
  );
};
