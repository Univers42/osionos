/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CoverSearchTab.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import type { CoverPickerAsset } from "@/shared/lib/markengine/uiCollectionAssets";
import { searchUnsplashPickerAssets } from "@/shared/lib/media/unsplash";
import { loadCoverGallery, searchCoverGallery } from "@/shared/lib/media/coverGallery";
import { CoverTile } from "./coverPickerTiles";

interface CoverSearchTabProps {
  value?: string;
  onSelect: (item: CoverPickerAsset) => void;
}

const PER_PAGE = 30;

/**
 * Live photo search (bridge → Unsplash, or the bridge's keyless fallback
 * provider). Debounced 350ms, 30 results per page with "Load more". When no
 * network source answers, it searches the 250-preset built-in gallery instead
 * of showing a static stub.
 */
export const CoverSearchTab: React.FC<CoverSearchTabProps> = ({ value, onSelect }) => {
  const [query, setQuery] = useState("people workspace");
  const [debounced, setDebounced] = useState(query);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CoverPickerAsset[]>([]);
  const [fallback, setFallback] = useState<CoverPickerAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastCount, setLastCount] = useState(PER_PAGE);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setLoading(true);
    });
    searchUnsplashPickerAssets({
      query: debounced,
      perPage: PER_PAGE,
      page,
      orientation: "landscape",
      signal: controller.signal,
    })
      .then(async (results) => {
        if (controller.signal.aborted) return;
        setLastCount(results.length);
        setItems((prev) => (page === 1 ? results : [...prev, ...results]));
        if (results.length === 0 && page === 1) {
          const cats = await loadCoverGallery();
          if (!controller.signal.aborted) setFallback(searchCoverGallery(cats, debounced, 30));
        } else {
          setFallback(null);
        }
      })
      .catch(() => { /* offline — the fallback path above covers it */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debounced, page]);

  const shown = items.length > 0 ? items : (fallback ?? []);
  const usingFallback = items.length === 0 && !!fallback?.length;

  return (
    <div className="space-y-2">
      <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-xs text-[var(--osio-fg-muted)]">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search photos"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        {shown.map((item) => (
          <CoverTile key={item.id} item={item} selected={value === item.ref} onSelect={() => onSelect(item)} />
        ))}
      </div>

      {usingFallback ? (
        <p className="text-[10px] text-[var(--osio-fg-subtle)]">
          Offline — showing matches from the built-in gallery.
        </p>
      ) : null}
      {!loading && shown.length === 0 ? (
        <p className="text-[10px] text-[var(--osio-fg-subtle)]">No results — try another keyword.</p>
      ) : null}
      {items.length > 0 && lastCount === PER_PAGE ? (
        <button
          type="button"
          disabled={loading}
          className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--osio-bg-hover)] disabled:opacity-60"
          onClick={() => setPage((p) => p + 1)}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
};
