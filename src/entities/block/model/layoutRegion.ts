/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutRegion.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Normalizes optional layout-cell region metadata for canvas readers.
// Unknown values are dropped; sticky survives only on sidebar regions.
// Also maps the normalized values to their DOM data attributes.

export type LayoutRegion = "header" | "left" | "main" | "right" | "footer";
export type RegionStackAt = "tablet" | "mobile" | "never";

const REGIONS: readonly LayoutRegion[] = ["header", "left", "main", "right", "footer"];
const STACK_AT: readonly RegionStackAt[] = ["tablet", "mobile", "never"];

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function normalizeRegion(value: unknown): LayoutRegion | undefined {
  return includes(REGIONS, value) ? value : undefined;
}

export function normalizeStackAt(value: unknown): RegionStackAt | undefined {
  return includes(STACK_AT, value) ? value : undefined;
}

export function normalizeSticky(value: unknown, region: LayoutRegion | undefined): true | undefined {
  return value === true && (region === "left" || region === "right") ? true : undefined;
}

export function regionAttributes(cell: { region?: unknown; stackAt?: unknown; sticky?: unknown }): {
  "data-region": string | undefined;
  "data-stack-at": string | undefined;
  "data-sticky": string | undefined;
} {
  const region = normalizeRegion(cell.region);
  return {
    "data-region": region,
    "data-stack-at": normalizeStackAt(cell.stackAt),
    "data-sticky": normalizeSticky(cell.sticky, region) === true ? "true" : undefined,
  };
}

/** `target` plus only the region fields of `source` that normalize to a value. */
export function withRegionFields<T extends object>(
  target: T,
  source: { region?: unknown; stackAt?: unknown; sticky?: unknown },
): T {
  const region = normalizeRegion(source.region);
  const stackAt = normalizeStackAt(source.stackAt);
  const sticky = normalizeSticky(source.sticky, region);
  if (region === undefined && stackAt === undefined && sticky === undefined) return target;
  return {
    ...target,
    ...(region === undefined ? {} : { region }),
    ...(stackAt === undefined ? {} : { stackAt }),
    ...(sticky === undefined ? {} : { sticky }),
  };
}
