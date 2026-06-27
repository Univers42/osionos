/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TemplateHeader.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import type { PageEntry } from "@/entities/page";
import type { HeaderRegionKind, HeaderSlot, HeaderTemplate } from "@/entities/page/model/headerTemplate";

import { HeaderSlotView } from "./headerSlots";

function regionClass(kind: HeaderRegionKind): string {
  switch (kind) {
    case "aside":
      return "shrink-0";
    case "main":
      return "flex flex-col gap-1 min-w-0";
    case "meta":
      return "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm";
    case "actions":
      return "flex flex-wrap items-center gap-2 pt-1";
    default:
      return "";
  }
}

interface Props {
  template: HeaderTemplate;
  page: PageEntry;
  onAction?: (slot: HeaderSlot) => void;
}

/** Render a record header purely from its data-driven template (composes atoms; no hardcoded styling). */
export const TemplateHeader: React.FC<Props> = ({ template, page, onAction }) => {
  const aside = template.regions.find((r) => r.kind === "aside");
  const body = template.regions.filter((r) => r.kind !== "aside");
  return (
    <div className={`flex gap-5 ${template.layout === "stacked" ? "flex-col" : ""}`}>
      {aside ? (
        <div className={regionClass("aside")}>
          {aside.slots.map((s) => (
            <HeaderSlotView key={s.id} slot={s} page={page} onAction={onAction} />
          ))}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {body.map((region) => (
          <div key={region.id} className={regionClass(region.kind)}>
            {region.slots.map((s, i) => (
              <React.Fragment key={s.id}>
                {i > 0 && region.kind === "meta" ? <span className="text-[var(--osio-fg-subtle)]">·</span> : null}
                <HeaderSlotView slot={s} page={page} onAction={onAction} />
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
