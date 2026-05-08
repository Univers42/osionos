/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaAssetPicker.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/08 05:35:15 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { AssetPickerBoard } from "@univers42/ui-collection";

import type { MediaBlockType } from "@/entities/block";
import {
  SLASH_MEDIA_PICKER_BOARD_PROPS,
  getSlashMediaPickerTabs,
} from "@/shared/lib/markengine/uiCollectionAssets";
import {
  searchUnsplashPickerAssets,
  toMediaPickerAsset,
} from "@/shared/lib/media/unsplash";

interface MediaAssetPickerProps {
  kind: MediaBlockType;
  value?: string;
  label?: string;
  width?: number | string;
  height?: number | string;
  onSelect: (value: string) => void;
}

export const MediaAssetPicker: React.FC<MediaAssetPickerProps> = ({
  kind,
  value,
  label,
  width = "100%",
  height = 332,
  onSelect,
}) => {
  const [query, setQuery] = useState("people workspace");
  const [unsplashItems, setUnsplashItems] = useState<Array<unknown>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (kind !== "image") return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setIsLoading(true);
    });
    searchUnsplashPickerAssets({
      query,
      perPage: 12,
      orientation: "landscape",
      signal: controller.signal,
    })
      .then((items) => {
        if (!controller.signal.aborted) {
          setUnsplashItems(items.map(toMediaPickerAsset));
          setHasLoaded(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUnsplashItems([]);
          setHasLoaded(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [kind, query]);

  const tabs = useMemo(
    () => getSlashMediaPickerTabs(kind, unsplashItems),
    [kind, unsplashItems],
  );

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="media-asset-picker"
      data-media-kind={kind}
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{ height }}
    >
      {kind === "image" ? (
        <div className="border-b border-[var(--osio-border-default)] px-3 py-2">
          <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-xs text-[var(--osio-fg-muted)]">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Unsplash"
              className="min-w-0 flex-1 bg-transparent text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
            />
          </label>
          {hasLoaded && unsplashItems.length === 0 ? (
            <p className="mt-1 text-[10px] text-[var(--osio-fg-subtle)]">
              Showing local fallbacks until the bridge has an Unsplash key.
            </p>
          ) : null}
        </div>
      ) : null}
      <AssetPickerBoard
        {...SLASH_MEDIA_PICKER_BOARD_PROPS}
        tabs={tabs}
        value={value}
        width={width}
        label={label ?? tabs[0]?.label ?? kind}
        onSerializedValueChange={onSelect}
      />
    </div>
  );
};
