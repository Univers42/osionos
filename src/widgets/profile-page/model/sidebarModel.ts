/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sidebarModel.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the profile sidebar shows, as data: the rows a profile yields for a visitor and the
 * call-to-action rows only its owner gets. Pure, so each field present / absent is a test and
 * the JSX only draws what this returns.
 *
 * Caveat: link hosts come from URL parsing, so only http(s) links are shown; a malformed one
 * is dropped, never repaired. The local time is Intl's from the server's IANA zone and an
 * unknown zone yields no time rather than a wrong one.
 */

import { linkKind, linkLabel, type LinkKind } from "@/features/settings/profile/linkKinds";
import type { MemberProfile } from "../useProfile";
import { activeStatus, type ShownStatus } from "./profileStatus";

export type PromptField = "headline" | "bio" | "location" | "links";

export interface SidebarFact {
  id: string;
  label: string;
  href?: string;
  /** Set on link facts: the site the host names, which picks the icon. */
  kind?: LinkKind;
}

export interface SidebarPrompt {
  field: PromptField;
  label: string;
}

export interface SidebarModel {
  name: string;
  username: string | null;
  pronouns: string | null;
  headline: string | null;
  bio: string | null;
  status: ShownStatus | null;
  presence: string;
  facts: SidebarFact[];
  prompts: SidebarPrompt[];
}

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const PATREON_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export function linkHost(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.host : null;
  } catch {
    return null;
  }
}

export function localTimeIn(timezone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(now);
  } catch {
    return null;
  }
}

const text = (value: string | null | undefined): string | null => (value && value.trim() ? value : null);

function linkFacts(profile: MemberProfile): SidebarFact[] {
  const hrefs = [profile.website, ...(profile.links ?? [])].filter((raw): raw is string => !!raw);
  return hrefs.flatMap((href, index) => {
    const host = linkHost(href);
    return host ? [{ id: `link:${index}`, label: linkLabel(href), href, kind: linkKind(href) }] : [];
  });
}

function detailFacts(profile: MemberProfile, now: Date): SidebarFact[] {
  const time = profile.timezone ? localTimeIn(profile.timezone, now) : null;
  const orcid = profile.orcid && ORCID_RE.test(profile.orcid) ? profile.orcid : null;
  const patreon = profile.patreon && PATREON_RE.test(profile.patreon) ? profile.patreon : null;
  const company = text(profile.company);
  const location = text(profile.location);
  return [
    ...(company ? [{ id: "company", label: company }] : []),
    ...(location ? [{ id: "location", label: location }] : []),
    ...(time ? [{ id: "time", label: time }] : []),
    ...linkFacts(profile),
    ...(orcid ? [{ id: "orcid", label: orcid, href: `https://orcid.org/${orcid}` }] : []),
    ...(patreon ? [{ id: "patreon", label: patreon, href: `https://www.patreon.com/${patreon}` }] : []),
  ];
}

const PROMPTS: Array<SidebarPrompt & { filled: (facts: SidebarFact[], profile: MemberProfile) => boolean }> = [
  { field: "headline", label: "Add a headline", filled: (_facts, profile) => !!text(profile.headline) },
  { field: "bio", label: "Add a bio", filled: (_facts, profile) => !!text(profile.bio) },
  { field: "location", label: "Add your location", filled: (facts) => facts.some((fact) => fact.id === "location") },
  { field: "links", label: "Add a link", filled: (facts) => facts.some((fact) => fact.id.startsWith("link:")) },
];

function presenceLine(profile: MemberProfile): string {
  const state = profile.online ? "Online now" : "Offline";
  return profile.role ? `${profile.role} · ${state}` : state;
}

export function buildSidebar(profile: MemberProfile, viewer: { isOwner: boolean; now: Date }): SidebarModel {
  const facts = detailFacts(profile, viewer.now);
  const prompts = viewer.isOwner
    ? PROMPTS.filter((prompt) => !prompt.filled(facts, profile)).map(({ field, label }) => ({ field, label }))
    : [];
  return {
    name: profile.name,
    username: text(profile.username),
    pronouns: text(profile.pronouns),
    headline: text(profile.headline),
    bio: text(profile.bio),
    status: activeStatus(profile.status, viewer.now),
    presence: presenceLine(profile),
    facts,
    prompts,
  };
}

/** The owner's "Write your README" row: shown while there is nothing for the README card to draw. */
export function showsReadmePrompt(profile: MemberProfile, isOwner: boolean): boolean {
  const readme = profile.readme;
  const drawn = !!readme && (readme.truncated === true || (Array.isArray(readme.blocks) && readme.blocks.length > 0));
  return isOwner && !drawn;
}
