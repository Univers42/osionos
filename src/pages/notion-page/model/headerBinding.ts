/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   headerBinding.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry, PagePropertyEntry } from "@/entities/page";
import type { HeaderStatFormat } from "@/entities/page/model/headerTemplate";

export type BindingValue = PagePropertyEntry["value"] | undefined;

/** Resolve a slot binding to a value — a record property by key, or a core page field. */
export function resolveBinding(page: PageEntry | undefined, key?: string): BindingValue {
  if (!page || !key) return undefined;
  const prop = page.properties?.find((p) => p.key === key);
  if (prop) return prop.value;
  if (key === "title") return page.title;
  if (key === "icon") return page.icon ?? null;
  if (key === "cover") return page.cover ?? null;
  return undefined;
}

/** Format a numeric stat (downloads); groups thousands by default. */
export function formatStat(value: BindingValue, format?: HeaderStatFormat): string {
  if (value == null) return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return typeof value === "string" ? value : "";
  if (format === "raw") return String(n);
  return n.toLocaleString("en-US");
}

/** A url shown without its scheme / trailing slash (e.g. "microsoft.com"). */
export function linkLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** Coerce a bound value into an IconValueView string (wraps bare urls/data-uris as `img:`). */
export function mediaIconValue(value: BindingValue, fallback?: string): string | undefined {
  if (typeof value === "string" && value.trim()) {
    const v = value.trim();
    if (/^(img:|icon:|url:|emoji:)/.test(v)) return v;
    if (/^(https?:)?\/\//.test(v) || v.startsWith("data:")) return `img:${v}`;
    return v;
  }
  return fallback;
}
