/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarketplaceAppRow.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Settings } from "lucide-react";

import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { Button } from "@/shared/ui/atoms/Button";
import type { PageEntry } from "@/entities/page";

import { readAppMeta } from "../model/appMeta";

interface Props {
  app: PageEntry;
  installed: boolean;
  isDraft?: boolean;
  onOpen: () => void;
  onInstall?: () => void;
  onConfig?: () => void;
}

/** One marketplace list row: icon · title (+ Draft pill) · description · company✓ + install count / Install. */
export const MarketplaceAppRow: React.FC<Props> = ({ app, installed, isDraft, onOpen, onInstall, onConfig }) => {
  const meta = readAppMeta(app);
  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-[var(--osio-bg-hover)]">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        <IconValueView value={app.icon} size={32} className="mt-0.5 shrink-0 rounded" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{app.title}</span>
            {isDraft ? <span className="shrink-0 rounded bg-[var(--osio-block-tint-yellow-bg)] px-1 py-0.5 text-[10px] font-semibold uppercase text-[var(--osio-block-tint-yellow-fg)]">Draft</span> : null}
          </span>
          <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{meta.description}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-[var(--osio-fg-subtle)]">
            <span className="truncate">{meta.company}</span>
            {meta.verified ? <IconValueView value="icon:badge-check;color=var(--osio-accent-text)" size={11} className="shrink-0" /> : null}
            {!installed && meta.downloads ? <span className="shrink-0">· {meta.downloads.toLocaleString("en-US")}</span> : null}
          </span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!installed && onInstall ? (
          <Button tone="primary" className="px-2 py-1 text-xs" onClick={onInstall}>
            Install
          </Button>
        ) : null}
        {onConfig ? (
          <button type="button" onClick={onConfig} aria-label="Configure" className="rounded p-1 text-[var(--osio-fg-subtle)] hover:text-[var(--osio-fg-default)]">
            <Settings size={14} />
          </button>
        ) : null}
      </span>
    </div>
  );
};
