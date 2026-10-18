/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmbedFooter.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ExternalLink } from "lucide-react";

import { displayHost, safeHttpUrl } from "@/shared/lib/embed";

import { Favicon } from "./Favicon";

interface Props {
  /** The URL actually framed: its host is what is shown, so a lookalike page
   *  cannot pass for the link's own site. */
  framedSrc: string;
  /** The link the user pasted; "Open" goes here. */
  openUrl: string;
  note?: string;
  bookmarkLabel?: string;
  onShowAsBookmark?: () => void;
}

const ACTION =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";

/** favicon · host · note · Open ↗ · optional "show as bookmark". */
export const EmbedFooter: React.FC<Props> = ({
  framedSrc, openUrl, note, bookmarkLabel = "Show as bookmark", onShowAsBookmark,
}) => {
  const open = safeHttpUrl(openUrl);
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--osio-fg-muted)]">
      <Favicon pageUrl={framedSrc} />
      <span className="min-w-0 truncate">{displayHost(framedSrc)}</span>
      {note === undefined ? null : <span className="min-w-0 truncate text-[var(--osio-fg-subtle)]">{note}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {onShowAsBookmark === undefined ? null : (
          <button type="button" className={ACTION} onClick={onShowAsBookmark}>
            {bookmarkLabel}
          </button>
        )}
        {open === "" ? null : (
          <a href={open} target="_blank" rel="noopener noreferrer" className={ACTION}>
            Open <ExternalLink aria-hidden size={12} />
          </a>
        )}
      </span>
    </div>
  );
};
