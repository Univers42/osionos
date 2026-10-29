/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkBlockToolbar.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ExternalLink } from "lucide-react";

interface LinkBlockToolbarProps {
  kind: "embed" | "bookmark";
  /** Already guarded by `safeHttpUrl`; "" hides Open. */
  openUrl: string;
  onReplace: () => void;
  onConvert: (type: "embed" | "bookmark") => void;
}

const BUTTON =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";

/** The hover bar of an embed or bookmark. Visible on hover or keyboard focus. */
export const LinkBlockToolbar: React.FC<LinkBlockToolbarProps> = ({ kind, openUrl, onReplace, onConvert }) => (
  <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/link:opacity-100">
    <button type="button" className={BUTTON} onClick={onReplace}>
      Replace link
    </button>
    {openUrl === "" ? null : (
      <a href={openUrl} target="_blank" rel="noopener noreferrer" className={BUTTON} aria-label="Open link in a new tab">
        Open <ExternalLink aria-hidden size={12} />
      </a>
    )}
    <button type="button" className={BUTTON} onClick={() => onConvert(kind === "embed" ? "bookmark" : "embed")}>
      {kind === "embed" ? "Show as bookmark" : "Embed instead"}
    </button>
  </div>
);
