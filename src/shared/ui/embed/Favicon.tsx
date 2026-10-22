/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Favicon.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Globe } from "lucide-react";

import { safeHttpUrl } from "@/shared/lib/embed";

/** The icon candidates in order: the resolved favicon, then the origin's
 *  `/favicon.ico`. A third-party icon service is not on the list: it would be told
 *  every hostname a user views. */
function faviconCandidates(favicon: string, pageUrl: string): string[] {
  const href = safeHttpUrl(pageUrl);
  const own = href === "" ? "" : `${new URL(href).origin}/favicon.ico`;
  return [safeHttpUrl(favicon), own].filter((candidate, index, all) => candidate !== "" && all.indexOf(candidate) === index);
}

interface Props {
  /** Resolved favicon URL; "" when unknown. */
  favicon?: string;
  /** The page the icon belongs to, for the `/favicon.ico` fallback. */
  pageUrl: string;
}

/** 16px site icon that falls through its candidates on error, ending on a globe. */
export const Favicon: React.FC<Props> = ({ favicon = "", pageUrl }) => {
  const candidates = faviconCandidates(favicon, pageUrl);
  const [failed, setFailed] = useState(0);
  const src = candidates[failed];
  if (src === undefined) return <Globe aria-hidden size={16} className="shrink-0 text-[var(--osio-fg-muted)]" />;
  return (
    <img
      key={src}
      src={src}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-4 w-4 shrink-0 rounded-sm"
      onError={() => setFailed((count) => count + 1)}
    />
  );
};
