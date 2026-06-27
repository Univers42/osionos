/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appMeta.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

/** Fixed ids of the shared, system-owned global marketplace (must match the seed). */
export const MARKETPLACE_WORKSPACE_ID = "5a4b1c2d-1111-4111-8111-000000000001";
export const MARKETPLACE_DATABASE_ID = "5a4b1c2d-2222-4222-8222-000000000002";

/** App-record property keys — the single source of truth shared by header, cards, rail and seed. */
export const APP_KEYS = {
  company: "company",
  verified: "verified",
  website: "website",
  description: "shortDescription",
  downloads: "downloads",
  stars: "stars",
  ratingsCount: "ratingsCount",
  version: "version",
  identifier: "identifier",
  publishedAt: "publishedAt",
  appUpdatedAt: "appUpdatedAt",
  categories: "categories",
  resources: "resources",
  preRelease: "preRelease",
  published: "published",
  launchKind: "launchKind",
  launchUrl: "launchUrl",
} as const;

export type AppLaunchKind = "embed" | "external" | "panel";

export interface AppMeta {
  identifier: string;
  company: string;
  verified: boolean;
  website: string;
  description: string;
  downloads: number;
  stars: number;
  ratingsCount: number;
  version: string;
  publishedAt: string;
  categories: string[];
  resources: string[];
  preRelease: boolean;
  published: boolean;
  launchKind: AppLaunchKind;
  launchUrl: string;
}

/** Read the typed app manifest off a record's loose properties (the only place keys are read). */
export function readAppMeta(page: PageEntry): AppMeta {
  const p = (k: string) => page.properties?.find((x) => x.key === k)?.value;
  const s = (v: unknown, fb = "") => (typeof v === "string" ? v : v == null ? fb : String(v));
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
  return {
    identifier: s(p(APP_KEYS.identifier)),
    company: s(p(APP_KEYS.company)),
    verified: p(APP_KEYS.verified) === true,
    website: s(p(APP_KEYS.website)),
    description: s(p(APP_KEYS.description)),
    downloads: Number(p(APP_KEYS.downloads)) || 0,
    stars: Number(p(APP_KEYS.stars)) || 0,
    ratingsCount: Number(p(APP_KEYS.ratingsCount)) || 0,
    version: s(p(APP_KEYS.version)),
    publishedAt: s(p(APP_KEYS.publishedAt)),
    categories: list(p(APP_KEYS.categories)),
    resources: list(p(APP_KEYS.resources)),
    preRelease: p(APP_KEYS.preRelease) === true,
    published: p(APP_KEYS.published) === true,
    launchKind: s(p(APP_KEYS.launchKind), "embed") as AppLaunchKind,
    launchUrl: s(p(APP_KEYS.launchUrl)),
  };
}
