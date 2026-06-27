/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   GifPicker.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Giphy search grid for the composer (WhatsApp/Slack-style): a debounced search
 * box over trending-by-default results. Picking a GIF hands the item up; the
 * composer downloads + uploads it through the normal attachment pipeline.
 */

import React, { useEffect, useState } from 'react';

import { searchGifs, trendingGifs, type GifItem } from '@/shared/chat/giphyApi';

interface GifPickerProps {
  onPick: (gif: GifItem) => void;
}

export const GifPicker: React.FC<GifPickerProps> = ({ onPick }) => {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    // setLoading(true) is driven by the input handler / initial state (not here) so
    // the effect never calls setState synchronously — only in the async callbacks.
    (debounced ? searchGifs(debounced) : trendingGifs())
      .then((gifs) => { if (alive) setItems(gifs); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [debounced]);

  return (
    <div className="w-72">
      <div className="border-b border-[var(--osio-border-default)] p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLoading(true); }}
          placeholder="Search GIFs"
          className="w-full rounded-md bg-[var(--osio-bg-subtle)] px-2 py-1.5 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {loading ? (
          <p className="px-1 py-6 text-center text-xs text-[var(--osio-fg-subtle)]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-[var(--osio-fg-subtle)]">No GIFs found.</p>
        ) : (
          <div className="columns-2 gap-2 [&>button]:mb-2">
            {items.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onPick(gif)}
                className="block w-full overflow-hidden rounded-md border border-transparent transition-colors hover:border-[var(--osio-accent)]"
              >
                <img src={gif.previewUrl} alt={gif.title} loading="lazy" className="w-full" />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="border-t border-[var(--osio-border-default)] px-2 py-1 text-right text-[10px] text-[var(--osio-fg-subtle)]">
        Powered by GIPHY
      </p>
    </div>
  );
};
