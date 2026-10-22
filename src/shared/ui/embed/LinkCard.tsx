/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkCard.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";

import { displayHost, safeHttpUrl, type EmbedInfo } from "@/shared/lib/embed";

import { Favicon } from "./Favicon";

export type LinkCardData = Pick<EmbedInfo, "url"> & Partial<Pick<EmbedInfo, "title" | "description" | "image" | "favicon" | "siteName">>;

const CARD =
  "block max-w-full overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";

/** The bookmark card: icon, site, title (the URL when there is none), two lines of
 *  description, optional image. The whole card is one link; an unsafe URL is text. */
export const LinkCard: React.FC<{ data: LinkCardData }> = ({ data }) => {
  const [isImageBroken, setIsImageBroken] = useState(false);
  const href = safeHttpUrl(data.url);
  if (href === "") return <span className="break-all text-sm text-[var(--osio-fg-muted)]">{data.url}</span>;
  const image = isImageBroken ? "" : safeHttpUrl(data.image ?? "");
  const title = data.title ?? "";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={CARD}>
      {image === "" ? null : (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIsImageBroken(true)}
          className="block max-h-44 w-full border-b border-[var(--osio-border-default)] object-cover"
        />
      )}
      <span className="flex items-start gap-3 p-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          <Favicon favicon={data.favicon} pageUrl={href} />
        </span>
        <span className="min-w-0 flex-1">
          {/* The host is derived from the URL being opened; the snapshot's siteName is
              page-supplied and could claim another site, so it only follows the host. */}
          <span className="block truncate text-xs uppercase tracking-wide text-[var(--osio-fg-subtle)]">
            {displayHost(href)}
            {data.siteName && data.siteName !== displayHost(href) ? (
              <span className="normal-case tracking-normal"> · {data.siteName}</span>
            ) : null}
          </span>
          <span
            className={`mt-0.5 block truncate text-sm ${title === "" ? "font-medium text-[var(--osio-accent-text)]" : "font-semibold text-[var(--osio-fg-default)]"}`}
          >
            {title === "" ? href : title}
          </span>
          {data.description ? (
            <span className="mt-0.5 block line-clamp-2 text-xs text-[var(--osio-fg-muted)]">{data.description}</span>
          ) : null}
        </span>
      </span>
    </a>
  );
};
