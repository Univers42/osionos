/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlashCommandPreview.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The pane beside the slash menu: the highlighted block drawn for real (the
// page's own read-only renderer, scaled down) on a small sheet of page, then
// its name and what it does. It is a picture for the eye only — inert and
// hidden from assistive tech, which already hears the option's label.

import React from "react";

import { ReadOnlyBlock } from "@/entities/block/ui";
import { slashPreviewSample } from "@/features/slash-commands/model/slashPreviewSamples";
import type { SlashCommand } from "@/features/slash-commands/model/types";

/** The sample lays out at 1/0.72 of the sheet's width, so a heading wraps as on a page. */
const SAMPLE_ZOOM = 0.72;

interface SlashCommandPreviewProps {
  command: SlashCommand | undefined;
  style: React.CSSProperties;
}

export const SlashCommandPreview = React.memo(function SlashCommandPreview({
  command,
  style,
}: Readonly<SlashCommandPreviewProps>) {
  if (!command) return null;
  const sample = slashPreviewSample(command);
  if (!sample && !command.description) return null;

  return (
    <div
      inert
      aria-hidden="true"
      data-testid="slash-command-preview"
      data-preview-command={command.id}
      className="osio-surface-overlay pointer-events-none fixed z-[calc(var(--osio-z-popover)+26)] flex w-[280px] flex-col gap-2 overflow-hidden"
      style={style}
    >
      {sample ? (
        <div
          data-testid="slash-command-preview-sample"
          className="max-h-[220px] shrink-0 overflow-hidden rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] px-4 py-3"
        >
          <div style={{ zoom: SAMPLE_ZOOM }}>
            {sample.map((block, index) => (
              <ReadOnlyBlock key={block.id} block={block} index={index} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="min-w-0 px-1 pb-0.5">
        <p className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{command.label}</p>
        {command.description ? (
          <p className="mt-0.5 text-xs leading-snug text-[var(--osio-fg-muted)]">{command.description}</p>
        ) : null}
      </div>
    </div>
  );
});
