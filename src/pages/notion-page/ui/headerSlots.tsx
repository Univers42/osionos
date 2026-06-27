/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   headerSlots.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { IconValueView } from "@/shared/ui/atoms/IconValueView/IconValueView";
import { Badge } from "@/shared/ui/atoms/Badge";
import { Button } from "@/shared/ui/atoms/Button";
import type { PageEntry } from "@/entities/page";
import type { HeaderSlot } from "@/entities/page/model/headerTemplate";

import { resolveBinding, formatStat, linkLabel, mediaIconValue, type BindingValue } from "../model/headerBinding";

const STAR_ON = "icon:star;color=var(--osio-block-tint-yellow-fg)";
const STAR_OFF = "icon:star;color=var(--osio-fg-subtle)";

/** A 0-5 star row + optional "(count)". */
export function renderStars(value: BindingValue, count: BindingValue): React.ReactNode {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <IconValueView key={i} value={i < rating ? STAR_ON : STAR_OFF} size={13} />
      ))}
      {count != null && count !== "" ? (
        <span className="ml-1 text-xs text-[var(--osio-fg-muted)]">({String(count)})</span>
      ) : null}
    </span>
  );
}

interface SlotProps {
  slot: HeaderSlot;
  page: PageEntry;
  onAction?: (slot: HeaderSlot) => void;
}

/** Render one header slot by composing existing atoms — token-styled, no hardcoded layout. */
export const HeaderSlotView: React.FC<SlotProps> = ({ slot, page, onAction }) => {
  const value = resolveBinding(page, slot.bind);
  switch (slot.kind) {
    case "media":
      return (
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)]">
          <IconValueView value={mediaIconValue(value, page.icon)} size={64} />
        </div>
      );
    case "title":
      return <h1 className="text-2xl font-bold leading-tight text-[var(--osio-fg-default)]">{String(value ?? page.title ?? "")}</h1>;
    case "author": {
      const verified = slot.verifiedBind ? Boolean(resolveBinding(page, slot.verifiedBind)) : false;
      return (
        <span className="inline-flex items-center gap-1 text-[var(--osio-fg-default)]">
          {String(value ?? "")}
          {verified ? <IconValueView value="icon:badge-check;color=var(--osio-accent-text)" size={14} /> : null}
        </span>
      );
    }
    case "link":
      return value ? (
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-[var(--osio-accent-text)] hover:underline">
          {linkLabel(String(value))}
        </a>
      ) : null;
    case "stat":
      return (
        <span className="inline-flex items-center gap-1 text-[var(--osio-fg-muted)]">
          {slot.icon ? <IconValueView value={slot.icon} size={14} /> : null}
          {formatStat(value, slot.format)}
        </span>
      );
    case "rating":
      return renderStars(value, slot.countBind ? resolveBinding(page, slot.countBind) : null);
    case "text":
      return <p className="text-sm text-[var(--osio-fg-muted)]">{String(value ?? "")}</p>;
    case "badge": {
      const items = Array.isArray(value) ? value : value != null && value !== "" ? [String(value)] : [];
      return <span className="inline-flex flex-wrap gap-1">{items.map((it) => <Badge key={it}>{it}</Badge>)}</span>;
    }
    case "action":
      return (
        <Button tone={slot.tone ?? "default"} onClick={onAction ? () => onAction(slot) : undefined}>
          {slot.icon ? <IconValueView value={slot.icon} size={14} /> : null}
          {slot.label ?? ""}
        </Button>
      );
    default:
      return null;
  }
};
