/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CoverGalleryTab.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

import {
  loadCoverGallery,
  searchCoverGallery,
  type CoverGalleryCategory,
} from "@/shared/lib/media/coverGallery";
import type { CoverPickerAsset } from "@/shared/lib/markengine/uiCollectionAssets";
import { CoverTile } from "./coverPickerTiles";

interface CoverGalleryTabProps {
  value?: string;
  onSelect: (item: CoverPickerAsset) => void;
}

const Grid: React.FC<{
  items: CoverPickerAsset[];
  value?: string;
  video?: boolean;
  onSelect: (item: CoverPickerAsset) => void;
}> = ({ items, value, video, onSelect }) => (
  <div className="grid grid-cols-3 gap-2">
    {items.map((item) => (
      <CoverTile
        key={item.id}
        item={item}
        video={video}
        selected={value === item.ref}
        onSelect={() => onSelect(item)}
      />
    ))}
  </div>
);

/**
 * The built-in gallery: 250+ verified presets in categories (gradients render
 * with zero network; photo thumbs are lazy). Instant local search across all
 * categories; category chips narrow the grid.
 */
export const CoverGalleryTab: React.FC<CoverGalleryTabProps> = ({ value, onSelect }) => {
  const [categories, setCategories] = useState<CoverGalleryCategory[] | null>(null);
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let on = true;
    void loadCoverGallery().then((cats) => { if (on) setCategories(cats); });
    return () => { on = false; };
  }, []);

  const hits = useMemo(
    () => (categories && query.trim() ? searchCoverGallery(categories, query, 60) : null),
    [categories, query],
  );

  if (!categories) {
    return (
      <div className="flex h-24 items-center justify-center text-[var(--osio-fg-muted)]">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  const active = categories.find((c) => c.id === activeCat);

  return (
    <div className="space-y-2">
      <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-xs text-[var(--osio-fg-muted)]">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${categories.reduce((n, c) => n + c.items.length, 0)} covers`}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </label>

      {hits ? (
        <Grid items={hits} value={value} onSelect={onSelect} />
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {[{ id: "all", label: "All" }, ...categories].map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={[
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                  activeCat === cat.id
                    ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
                    : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]",
                ].join(" ")}
                onClick={() => setActiveCat(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {active ? (
            <Grid items={active.items} value={value} video={active.kind === "video"} onSelect={onSelect} />
          ) : (
            categories.map((cat) => (
              <div key={cat.id} className="space-y-1.5">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">
                  {cat.label}
                </p>
                <Grid items={cat.items} value={value} video={cat.kind === "video"} onSelect={onSelect} />
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
};
