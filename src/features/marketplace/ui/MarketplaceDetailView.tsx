/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarketplaceDetailView.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";

import type { PageEntry } from "@/entities/page";
import { resolveHeaderTemplate } from "@/entities/page/model/templateRegistry";
import { TemplateHeader } from "@/pages/notion-page/ui/TemplateHeader";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { useHeaderTemplateStore } from "@/features/template-designer/model/headerTemplateStore";
import { HeaderDesigner } from "@/features/template-designer/ui/HeaderDesigner";

import { MARKETPLACE_DATABASE_ID } from "../model/appMeta";
import { MARKETPLACE_RECORD_TEMPLATE } from "../model/marketplaceRecordTemplate";
import { MarketplaceInfoRail } from "./MarketplaceInfoRail";
import { MarketplaceActionBar } from "./MarketplaceActionBar";

interface Props {
  app: PageEntry;
  subPages: PageEntry[];
}

const TABS = MARKETPLACE_RECORD_TEMPLATE.subPages.filter((s) => !s.rail);

/** The marketinfo.png detail body: template header + action bar + DETAILS/FEATURES/CHANGELOG tabs + right rail. */
export const MarketplaceDetailView: React.FC<Props> = ({ app, subPages }) => {
  const [active, setActive] = useState(TABS[0]?.slug ?? "details");
  const [designing, setDesigning] = useState(false);
  const dbId = app.databaseId ?? MARKETPLACE_DATABASE_ID;
  const override = useHeaderTemplateStore((s) => s.overrides[dbId]);
  useEffect(() => useHeaderTemplateStore.getState().ensureLoaded(dbId), [dbId]);
  const template = override ?? resolveHeaderTemplate(dbId);
  const bindKeys = useMemo(() => ["title", "icon", "cover", ...(app.properties ?? []).map((p) => p.key)], [app.properties]);
  const activeTab = TABS.find((t) => t.slug === active) ?? TABS[0];
  const activeChild = subPages.find((c) => c.title === activeTab?.title);
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-6 py-5">
      {template ? <TemplateHeader template={template} page={app} /> : <h1 className="text-2xl font-bold text-[var(--osio-fg-default)]">{app.title}</h1>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MarketplaceActionBar app={app} />
        {template ? (
          <button type="button" onClick={() => setDesigning(true)} className="text-xs text-[var(--osio-fg-subtle)] hover:text-[var(--osio-fg-default)]">
            Customize header
          </button>
        ) : null}
      </div>
      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex gap-4 border-b border-[var(--osio-border-default)]">
            {TABS.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => setActive(t.slug)}
                className={`-mb-px border-b-2 px-1 pb-2 text-sm transition-colors ${
                  active === t.slug
                    ? "border-[var(--osio-accent)] text-[var(--osio-fg-default)]"
                    : "border-transparent text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
          <div className="pt-4">
            {activeChild?.content?.length ? (
              <PageBlocksRenderer blocks={activeChild.content} />
            ) : (
              <p className="text-sm text-[var(--osio-fg-subtle)]">No {(activeTab?.title ?? "content").toLowerCase()} yet.</p>
            )}
          </div>
        </div>
        <MarketplaceInfoRail app={app} />
      </div>
      {template ? (
        <HeaderDesigner open={designing} onClose={() => setDesigning(false)} scopes={[{ key: dbId, label: "This database" }]} template={template} sample={app} bindKeys={bindKeys} />
      ) : null}
    </div>
  );
};
