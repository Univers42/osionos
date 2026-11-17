/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkKinds.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The kind of a profile link, read from its host, which picks the icon. A host matches
 * itself and its subdomains, never a lookalike (`notgithub.com`, `github.com.evil.example`).
 *
 * Caveat: the host table is a short list of well-known sites; an unlisted site, a custom
 * domain or a vanity host for a listed one reads as "site". Wrong in that direction only
 * (a generic icon), never a wrong brand.
 */

export type LinkKind = "github" | "gitlab" | "linkedin" | "x" | "youtube" | "site";

const HOSTS: ReadonlyArray<readonly [LinkKind, readonly string[]]> = [
  ["github", ["github.com"]],
  ["gitlab", ["gitlab.com"]],
  ["linkedin", ["linkedin.com"]],
  ["x", ["x.com", "twitter.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
];

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  github: "GitHub", gitlab: "GitLab", linkedin: "LinkedIn", x: "X", youtube: "YouTube", site: "Website",
};

export function linkKind(raw: string): LinkKind {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return "site";
  }
  for (const [kind, domains] of HOSTS) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return kind;
  }
  return "site";
}

// Shown in the profile sidebar: host (no "www.") plus path, so two links on one site differ.
// Caveat: a "www." host that is a distinct site from the bare host is shown as the bare host;
// the full URL stays in the row's title. Non-URL text comes back unchanged.
export function linkLabel(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.host.replace(/^www\./i, "")}${path}`;
  } catch {
    return raw;
  }
}
