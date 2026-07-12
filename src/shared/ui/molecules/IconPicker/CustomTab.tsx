/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CustomTab.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Upload } from "lucide-react";

const FIELD = "w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)]";
const BTN = "rounded-md bg-[var(--osio-accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--osio-accent-fg)] transition-colors duration-[120ms] hover:bg-[var(--osio-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60";

/** "Any SVG you like": paste raw <svg> markup, paste an image/SVG URL, or upload a file. */
export const CustomTab: React.FC<{ onPick: (ref: string) => void }> = ({ onPick }) => {
  const [markup, setMarkup] = useState("");
  const [url, setUrl] = useState("");

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onPick(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full space-y-3 overflow-auto p-3">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--osio-border-default)] px-3 py-3 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
        <Upload size={16} /> Upload an image or SVG
        <input type="file" accept="image/*,.svg" className="hidden" onChange={onFile} />
      </label>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Paste an image / SVG URL</span>
        <div className="flex gap-2">
          <input className={FIELD} placeholder="https://… or data:…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className={BTN} disabled={!url.trim()} onClick={() => onPick(url.trim())}>Use</button>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Paste raw &lt;svg&gt; markup</span>
        <textarea
          className={`${FIELD} h-20 resize-none font-mono text-xs`}
          placeholder="<svg viewBox='0 0 24 24'>…</svg>"
          value={markup}
          onChange={(e) => setMarkup(e.target.value)}
        />
        <button
          type="button"
          className={BTN}
          disabled={!markup.trim().toLowerCase().startsWith("<svg")}
          onClick={() => onPick(`data:image/svg+xml,${encodeURIComponent(markup.trim())}`)}
        >
          Use SVG
        </button>
      </div>
    </div>
  );
};
