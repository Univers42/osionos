/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CoverAssetPicker.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef, useState } from "react";
import { Image, Link, Upload } from "lucide-react";

import { useUserStore } from "@/features/auth";
import type { CoverPickerAsset } from "@/shared/lib/markengine/uiCollectionAssets";
import { useAssetLibraryStore, type AccountAsset } from "@/shared/config/assetLibraryStore";
import { CoverGalleryTab } from "./CoverGalleryTab";
import { CoverLibraryTab } from "./CoverLibraryTab";
import { CoverSearchTab } from "./CoverSearchTab";
import { CoverVideoTab } from "./CoverVideoTab";
import { normalizeExternalUrl } from "./coverPickerTiles";

interface CoverAssetPickerProps {
  value?: string;
  label?: string;
  onSelect: (value: string) => void;
}

type CoverPickerTab = "gallery" | "unsplash" | "video" | "url" | "upload" | "library";

const TABS: Array<{ id: CoverPickerTab; label: string }> = [
  { id: "gallery", label: "Gallery" },
  { id: "unsplash", label: "Unsplash" },
  { id: "video", label: "Video" },
  { id: "url", label: "URL" },
  { id: "upload", label: "Upload" },
  { id: "library", label: "Library" },
];

const EMPTY_ASSETS: AccountAsset[] = [];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") { resolve(reader.result); return; }
      reject(new Error("Could not read image upload."));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Could not read image upload.")));
    reader.readAsDataURL(file);
  });
}

export const CoverAssetPicker: React.FC<CoverAssetPickerProps> = ({
  value,
  label = "Cover assets",
  onSelect,
}) => {
  const [activeTab, setActiveTab] = useState<CoverPickerTab>("gallery");
  const [urlDraft, setUrlDraft] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUserId = useUserStore((s) => s.activeUserId) || "anonymous";
  const libraryAssets = useAssetLibraryStore((s) => s.assetsByUser[activeUserId] ?? EMPTY_ASSETS);
  const addAsset = useAssetLibraryStore((s) => s.addAsset);
  const removeAsset = useAssetLibraryStore((s) => s.removeAsset);

  const reusableCovers = useMemo(
    () => libraryAssets.filter((asset) => asset.kind === "cover" || asset.kind === "image"),
    [libraryAssets],
  );

  function selectAndRemember(item: CoverPickerAsset, origin: "preloaded" | "unsplash") {
    addAsset(activeUserId, { kind: "cover", name: item.label, source: item.ref, origin });
    onSelect(item.ref);
  }

  function selectUrl(normalized: string) {
    addAsset(activeUserId, {
      kind: "cover",
      name: normalized.replace(/^https?:\/\//, "").slice(0, 48),
      source: normalized,
      origin: normalized.includes("unsplash.com") ? "unsplash" : "url",
    });
    onSelect(normalized);
  }

  function applyUrl() {
    const normalized = normalizeExternalUrl(urlDraft);
    if (!normalized) { setUrlError("Enter a valid image URL."); return; }
    setUrlError(null);
    selectUrl(normalized);
    setUrlDraft("");
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const source = await readFileAsDataUrl(file);
    const asset = addAsset(activeUserId, {
      kind: "cover", name: file.name, source, origin: "upload",
      mimeType: file.type, size: file.size,
    });
    onSelect(asset.source);
  }

  return (
    <div className="osionos-cover-picker w-[min(560px,calc(100vw-48px))] rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-menu)]">
      <div className="border-b border-[var(--osio-border-default)] px-3 py-2">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Image size={15} />
          <span>{label}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={[
                "rounded-md px-2 py-1 text-xs font-medium",
                activeTab === tab.id
                  ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
                  : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
              ].join(" ")}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto p-3">
        {activeTab === "gallery" ? (
          <CoverGalleryTab value={value} onSelect={(item) => selectAndRemember(item, "preloaded")} />
        ) : null}

        {activeTab === "unsplash" ? (
          <CoverSearchTab value={value} onSelect={(item) => selectAndRemember(item, "unsplash")} />
        ) : null}

        {activeTab === "video" ? (
          <CoverVideoTab
            value={value}
            onSelect={(item) => selectAndRemember(item, "preloaded")}
            onSelectUrl={selectUrl}
          />
        ) : null}

        {activeTab === "url" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2">
              <Link size={15} className="text-[var(--osio-fg-muted)]" />
              <input
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); applyUrl(); }
                }}
                placeholder="https://images.unsplash.com/..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
              />
            </div>
            {urlError ? <p className="text-xs text-[var(--osio-danger)]">{urlError}</p> : null}
            <button
              type="button"
              className="w-full rounded-md bg-[var(--osio-accent)] px-3 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
              onClick={applyUrl}
            >
              Use URL
            </button>
          </div>
        ) : null}

        {activeTab === "upload" ? (
          <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-5 text-center">
            <Upload className="mx-auto text-[var(--osio-accent)]" size={24} />
            <p className="mt-2 text-sm font-medium">Upload cover</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              type="button"
              className="mt-3 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--osio-bg-hover)]"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose image
            </button>
          </div>
        ) : null}

        {activeTab === "library" ? (
          <CoverLibraryTab
            assets={reusableCovers}
            value={value}
            onSelect={onSelect}
            onRemove={(assetId) => removeAsset(activeUserId, assetId)}
          />
        ) : null}
      </div>
    </div>
  );
};
