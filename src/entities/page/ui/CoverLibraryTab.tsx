/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CoverLibraryTab.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Trash2 } from "lucide-react";

import type { AccountAsset } from "@/shared/config/assetLibraryStore";
import { CoverTile } from "./coverPickerTiles";
import { isVideoCoverSource } from "./coverMedia";

interface CoverLibraryTabProps {
  assets: AccountAsset[];
  value?: string;
  onSelect: (value: string) => void;
  onRemove: (assetId: string) => void;
}

/** The user's saved covers (every previously used cover lands here). */
export const CoverLibraryTab: React.FC<CoverLibraryTabProps> = ({
  assets,
  value,
  onSelect,
  onRemove,
}) => {
  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-4 py-8 text-center text-sm text-[var(--osio-fg-muted)]">
        No saved cover assets yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {assets.map((asset) => (
        <div key={asset.id} className="group relative">
          <CoverTile
            item={{
              id: asset.id,
              label: asset.name,
              ref: asset.source,
              previewUrl: asset.source,
              credit: asset.origin,
            }}
            video={isVideoCoverSource(asset.source)}
            selected={value === asset.source}
            onSelect={onSelect}
          />
          <button
            type="button"
            title="Remove asset"
            className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded bg-[var(--osio-bg-surface)] text-[var(--osio-danger)] shadow group-hover:flex"
            onClick={() => onRemove(asset.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
