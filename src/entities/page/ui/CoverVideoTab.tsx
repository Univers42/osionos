/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CoverVideoTab.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";
import { Film, Link, Loader2, Search } from "lucide-react";

import type { CoverPickerAsset } from "@/shared/ui/assets/uiCollectionAssets";
import { loadCoverGallery } from "@/shared/lib/media/coverGallery";
import { searchCoverVideos } from "@/shared/lib/media/coverVideos";
import { searchRefusalNotice } from "@/shared/lib/media/searchRefusal";
import { CoverTile, normalizeExternalUrl } from "./coverPickerTiles";

interface CoverVideoTabProps {
  value?: string;
  onSelect: (item: CoverPickerAsset) => void;
  onSelectUrl: (url: string) => void;
}

type VideoSearch =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable"; note: string }
  | { status: "done"; items: CoverPickerAsset[] };

const SEARCH_DEBOUNCE_MS = 350;

const UNAVAILABLE = "Video search is unavailable right now.";

function searchNote(search: VideoSearch): string | null {
  if (search.status === "unavailable") return search.note;
  if (search.status !== "done") return null;
  return search.items.length === 0 ? "No videos found — try another keyword." : "Videos from Pixabay";
}

/**
 * Video covers: a Pixabay search (through the bridge), curated ambient presets
 * (public-domain, verified) and any direct .mp4/.webm URL. Covers always render
 * muted + looped — no sound, ever.
 */
export const CoverVideoTab: React.FC<CoverVideoTabProps> = ({ value, onSelect, onSelectUrl }) => {
  const [videos, setVideos] = useState<CoverPickerAsset[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<VideoSearch>({ status: "idle" });

  useEffect(() => {
    const term = query.trim();
    let on = true;
    const timer = setTimeout(() => {
      if (!term) {
        setSearch({ status: "idle" });
        return;
      }
      setSearch({ status: "loading" });
      searchCoverVideos(term)
        .then((items) => { if (on) setSearch({ status: "done", items }); })
        .catch((error: unknown) => {
          if (on) setSearch({ status: "unavailable", note: searchRefusalNotice(error) ?? UNAVAILABLE });
        });
    }, term ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      on = false;
      clearTimeout(timer);
    };
  }, [query]);

  const found = search.status === "done" ? search.items : [];
  const note = searchNote(search);

  useEffect(() => {
    let on = true;
    void loadCoverGallery().then((cats) => {
      if (on) setVideos(cats.filter((c) => c.kind === "video").flatMap((c) => c.items));
    });
    return () => { on = false; };
  }, []);

  function applyUrl() {
    const normalized = normalizeExternalUrl(draft);
    if (!normalized) {
      setError("Enter a valid video URL (.mp4, .webm…).");
      return;
    }
    setError(null);
    onSelectUrl(normalized);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-[var(--osio-fg-muted)]">
        {search.status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search videos"
          placeholder="Search videos"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </label>
      {note ? <p className="text-xs text-[var(--osio-fg-subtle)]">{note}</p> : null}

      <div className="flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2">
        <Link size={16} className="text-[var(--osio-fg-muted)]" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); applyUrl(); }
          }}
          placeholder="https://…/ambient.mp4"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
        <button
          type="button"
          className="shrink-0 rounded-md bg-[var(--osio-accent)] px-2.5 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
          onClick={applyUrl}
        >
          Use
        </button>
      </div>
      {error ? <p className="text-xs text-[var(--osio-danger)]">{error}</p> : null}

      <div className="flex items-center gap-2 text-3xs text-[var(--osio-fg-subtle)]">
        <Film size={12} />
        Video covers play muted on a loop — they never make sound.
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(found.length > 0 ? found : videos).map((item) => (
          <CoverTile key={item.id} item={item} video selected={value === item.ref} onSelect={() => onSelect(item)} />
        ))}
      </div>
    </div>
  );
};
