/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileFields.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Public-profile rows of the built-in profile page. Every field is optional and
 * renders nothing when absent.
 *
 * Caveat: the local time is formatted by Intl from the server's IANA timezone
 * string; an unknown zone renders no time rather than a wrong one. Link hosts
 * come from URL parsing, so only http(s) links are shown.
 */

import React, { useEffect, useState } from 'react';

import type { MemberProfile } from './useProfile';

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const PATREON_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export function linkHost(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.host : null;
  } catch {
    return null;
  }
}

export function localTimeIn(timezone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(now);
  } catch {
    return null;
  }
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const ExternalLink: React.FC<{ href: string; label: string }> = ({ href, label }) => (
  <a href={href} target="_blank" rel="noopener noreferrer me" className="text-[var(--osio-accent)] hover:underline">
    {label}
  </a>
);

export const ProfileFacts: React.FC<{ profile: MemberProfile }> = ({ profile }) => {
  const now = useMinuteClock();
  const time = profile.timezone ? localTimeIn(profile.timezone, now) : null;
  const plain = [profile.company, profile.location].filter(Boolean) as string[];
  const hrefs = [profile.website, ...(profile.links ?? [])].filter((raw): raw is string => !!raw);
  const links = hrefs.flatMap((href) => {
    const host = linkHost(href);
    return host ? [{ href, host }] : [];
  });
  const orcid = profile.orcid && ORCID_RE.test(profile.orcid) ? profile.orcid : null;
  const patreon = profile.patreon && PATREON_RE.test(profile.patreon) ? profile.patreon : null;
  if (!plain.length && !time && !links.length && !orcid && !patreon) return null;

  return (
    <div className="mt-6 flex flex-col gap-1 text-sm text-[var(--osio-fg-muted)]">
      {plain.map((text) => <span key={text}>{text}</span>)}
      {time && <span data-testid="local-time">{time}</span>}
      {links.map(({ href, host }) => <ExternalLink key={href} href={href} label={host} />)}
      {orcid && <ExternalLink href={`https://orcid.org/${orcid}`} label={orcid} />}
      {patreon && <ExternalLink href={`https://www.patreon.com/${patreon}`} label={patreon} />}
    </div>
  );
};
