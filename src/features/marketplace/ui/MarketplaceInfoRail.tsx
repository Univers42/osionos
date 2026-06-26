/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarketplaceInfoRail.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { Badge } from "@/shared/ui/atoms/Badge";
import type { PageEntry } from "@/entities/page";

import { readAppMeta } from "../model/appMeta";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--osio-border-subtle)] pb-3">
      <p className="pb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-xs">
      <span className="text-[var(--osio-fg-subtle)]">{label}</span>
      <span className="min-w-0 truncate text-[var(--osio-fg-default)]">{value}</span>
    </div>
  );
}

/** The marketinfo.png right rail: Installation · Categories · Resources, all from the app record. */
export const MarketplaceInfoRail: React.FC<{ app: PageEntry }> = ({ app }) => {
  const meta = readAppMeta(app);
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-3">
      <Section title="Installation">
        <Row label="Identifier" value={meta.identifier || "—"} />
        <Row label="Version" value={meta.version || "—"} />
        <Row label="Published" value={meta.publishedAt ? meta.publishedAt.slice(0, 10) : "—"} />
      </Section>
      {meta.categories.length ? (
        <Section title="Categories">
          <span className="flex flex-wrap gap-1">
            {meta.categories.map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </span>
        </Section>
      ) : null}
      {meta.resources.length ? (
        <Section title="Resources">
          <span className="flex flex-col gap-0.5">
            {meta.resources.map((r) => (
              <a key={r} href={r} target="_blank" rel="noreferrer" className="truncate text-xs text-[var(--osio-accent-text)] hover:underline">
                {r.replace(/^https?:\/\//, "")}
              </a>
            ))}
          </span>
        </Section>
      ) : null}
    </aside>
  );
};
