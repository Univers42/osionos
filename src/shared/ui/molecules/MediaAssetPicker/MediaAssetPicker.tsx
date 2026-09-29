/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaAssetPicker.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/09/29 18:04:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { AssetPickerBoard } from "@univers42/ui-collection";

import type { MediaBlockType } from "@/entities/block";
import {
  SLASH_MEDIA_PICKER_BOARD_PROPS,
  getSlashMediaPickerTabs,
  type CoverPickerAsset,
} from "@/shared/ui/assets/uiCollectionAssets";
import {
  searchUnsplashPickerAssets,
  toMediaPickerAsset,
} from "@/shared/lib/media/unsplash";
import {
  formatSearchStatusAria,
  normalizeSearchQuery,
  resolveFallbackNotice,
  shouldFetchUnsplash,
} from "./mediaAssetPickerUtils";

export interface MediaAssetPickerProps {
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
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [unsplashItems, setUnsplashItems] = useState<CoverPickerAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (kind !== "image") return;

    if (!shouldFetchUnsplash(kind, debouncedQuery)) {
      queueMicrotask(() => {
        setUnsplashItems([]);
        setIsLoading(false);
        setHasLoaded(true);
      });
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setIsLoading(true);
    });

    searchUnsplashPickerAssets({
      query: normalizeSearchQuery(debouncedQuery),
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
  }, [kind, debouncedQuery]);

  const tabs = useMemo(
    () => getSlashMediaPickerTabs(kind, unsplashItems),
    [kind, unsplashItems],
  );

  const fallbackNotice = resolveFallbackNotice(hasLoaded, unsplashItems.length);
  const searchStatus = formatSearchStatusAria(
    isLoading,
    unsplashItems.length,
    hasLoaded,
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
        <div role="search" className="border-b border-[var(--osio-border-default)] px-3 py-2">
          <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-xs text-[var(--osio-fg-muted)]">
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Search size={14} aria-hidden="true" />
            )}
            <input
              role="searchbox"
              aria-label="Search Unsplash photos"
              aria-busy={isLoading}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Unsplash"
              className="min-w-0 flex-1 bg-transparent text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
            />
            {query.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)] transition-colors focus:outline-none"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div role="status" aria-live="polite" className="sr-only">
            {searchStatus}
          </div>
          {fallbackNotice ? (
            <p className="mt-1 text-[10px] text-[var(--osio-fg-subtle)]">
              {fallbackNotice}
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
