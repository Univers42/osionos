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
import { Film, Link } from "lucide-react";

import type { CoverPickerAsset } from "@/shared/lib/markengine/uiCollectionAssets";
import { loadCoverGallery } from "@/shared/lib/media/coverGallery";
import { CoverTile, normalizeExternalUrl } from "./coverPickerTiles";

interface CoverVideoTabProps {
  value?: string;
  onSelect: (item: CoverPickerAsset) => void;
  onSelectUrl: (url: string) => void;
}

/**
 * Video covers: curated ambient presets (public-domain, verified) plus any
 * direct .mp4/.webm URL. Covers always render muted + looped — no sound, ever.
 */
export const CoverVideoTab: React.FC<CoverVideoTabProps> = ({ value, onSelect, onSelectUrl }) => {
  const [videos, setVideos] = useState<CoverPickerAsset[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2">
        <Link size={15} className="text-[var(--osio-fg-muted)]" />
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

      <div className="flex items-center gap-2 text-[10px] text-[var(--osio-fg-subtle)]">
        <Film size={12} />
        Video covers play muted on a loop — they never make sound.
      </div>

      <div className="grid grid-cols-3 gap-2">
        {videos.map((item) => (
          <CoverTile key={item.id} item={item} video selected={value === item.ref} onSelect={() => onSelect(item)} />
        ))}
      </div>
    </div>
  );
};
