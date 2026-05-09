import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Link, Loader2, Search, Trash2, Upload } from "lucide-react";

import { useUserStore } from "@/features/auth";
import {
  useAssetLibraryStore,
  type AccountAsset,
} from "@/shared/config/assetLibraryStore";
import {
  COVER_PICKER_BOARD_PROPS,
  COVER_PICKER_TABS,
  UNSPLASH_COVER_ITEMS,
  normalizeMediaSource,
  resolveCollectionMediaAsset,
  type CoverPickerAsset,
} from "@/shared/lib/markengine/uiCollectionAssets";
import { searchUnsplashPickerAssets } from "@/shared/lib/media/unsplash";
import { ImageAssetPickerPanel } from "@/shared/ui/molecules/MediaAssetPicker/ImageAssetPickerPanel";

interface CoverAssetPickerProps {
  value?: string;
  label?: string;
  onSelect: (value: string) => void;
}

type CoverPickerTab =
  | "gallery"
  | "gradients"
  | "unsplash"
  | "url"
  | "upload"
  | "library";

const GRADIENT_COVERS: CoverPickerAsset[] = [
  {
    id: "gradient-aurora",
    label: "Aurora",
    ref: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
  },
  {
    id: "gradient-forest",
    label: "Forest",
    ref: "linear-gradient(135deg, #16a34a 0%, #0f766e 100%)",
  },
  {
    id: "gradient-night",
    label: "Night",
    ref: "radial-gradient(circle at top, #475569 0%, #020617 70%)",
  },
];

const TABS: Array<{ id: CoverPickerTab; label: string }> = [
  { id: "gallery", label: "Gallery" },
  { id: "gradients", label: "Gradients" },
  { id: "unsplash", label: "Unsplash" },
  { id: "url", label: "URL" },
  { id: "upload", label: "Upload" },
  { id: "library", label: "Library" },
];

const EMPTY_ASSETS: AccountAsset[] = [];

const COVER_PANEL_BOARD_PROPS = {
  ...COVER_PICKER_BOARD_PROPS,
  styles: {
    ...COVER_PICKER_BOARD_PROPS.styles,
    root: {
      ...COVER_PICKER_BOARD_PROPS.styles?.root,
      border: "none",
      borderRadius: 0,
      background: "transparent",
      boxShadow: "none",
    },
    searchField: {
      ...COVER_PICKER_BOARD_PROPS.styles?.searchField,
      padding: "10px 0 8px",
    },
    grid: {
      ...COVER_PICKER_BOARD_PROPS.styles?.grid,
      padding: "4px 0 0",
    },
  },
};

function isGradient(value: string): boolean {
  return value.startsWith("linear-gradient") || value.startsWith("radial-gradient");
}

function normalizeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image upload."));
    });
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Could not read image upload.")));
    reader.readAsDataURL(file);
  });
}

const CoverTile: React.FC<{
  item: CoverPickerAsset;
  selected?: boolean;
  onSelect: (item: CoverPickerAsset) => void;
}> = ({ item, selected, onSelect }) => {
  const preview = item.previewUrl ?? item.ref;
  return (
    <button
      type="button"
      title={item.label}
      className={[
        "group overflow-hidden rounded-md border text-left transition",
        selected
          ? "border-[var(--osio-accent)] ring-2 ring-[var(--osio-accent)]/20"
          : "border-[var(--osio-border-default)] hover:border-[var(--osio-accent)]",
      ].join(" ")}
      onClick={() => onSelect(item)}
    >
      <span className="block h-20 bg-[var(--osio-bg-subtle)]">
        {isGradient(preview) ? (
          <span className="block h-full w-full" style={{ background: preview }} />
        ) : (
          <img
            src={normalizeMediaSource(preview)}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
      </span>
      <span className="flex min-h-8 items-center justify-between gap-2 px-2 py-1.5">
        <span className="truncate text-xs font-medium text-[var(--osio-fg-default)]">
          {item.label}
        </span>
        {item.credit ? (
          <span className="text-[10px] text-[var(--osio-fg-subtle)]">
            {item.credit}
          </span>
        ) : null}
      </span>
    </button>
  );
};

export const CoverAssetPicker: React.FC<CoverAssetPickerProps> = ({
  value,
  label = "Cover assets",
  onSelect,
}) => {
  const [activeTab, setActiveTab] = useState<CoverPickerTab>("gallery");
  const [urlDraft, setUrlDraft] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [unsplashQuery, setUnsplashQuery] = useState("people workspace");
  const [unsplashItems, setUnsplashItems] = useState<CoverPickerAsset[]>([]);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [unsplashLoaded, setUnsplashLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUserId = useUserStore((state) => state.activeUserId) || "anonymous";
  const libraryAssets = useAssetLibraryStore(
    (state) => state.assetsByUser[activeUserId] ?? EMPTY_ASSETS,
  );
  const addAsset = useAssetLibraryStore((state) => state.addAsset);
  const removeAsset = useAssetLibraryStore((state) => state.removeAsset);

  const reusableCovers = useMemo(
    () => libraryAssets.filter((asset) => asset.kind === "cover" || asset.kind === "image"),
    [libraryAssets],
  );

  useEffect(() => {
    if (activeTab !== "unsplash") return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setUnsplashLoading(true);
      }
    });

    searchUnsplashPickerAssets({
      query: unsplashQuery,
      perPage: 12,
      orientation: "landscape",
      signal: controller.signal,
    })
      .then((items) => {
        if (!controller.signal.aborted) {
          setUnsplashItems(items);
          setUnsplashLoaded(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUnsplashItems([]);
          setUnsplashLoaded(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setUnsplashLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeTab, unsplashQuery]);

  function rememberSelection(
    source: string,
    name: string,
    origin: "preloaded" | "unsplash" | "url" | "upload",
  ) {
    addAsset(activeUserId, {
      kind: "cover",
      name,
      source,
      origin,
    });
    onSelect(source);
  }

  function handleGallerySelect(nextValue: string) {
    const resolved = resolveCollectionMediaAsset(
      nextValue,
      COVER_PICKER_TABS,
      label,
      "cover",
    );

    rememberSelection(nextValue, resolved?.label ?? label, "preloaded");
  }

  function selectAndRemember(
    item: CoverPickerAsset,
    origin: "preloaded" | "unsplash",
  ) {
    rememberSelection(item.ref, item.label, origin);
  }

  function applyUrl() {
    const normalized = normalizeExternalUrl(urlDraft);
    if (!normalized) {
      setUrlError("Enter a valid image URL.");
      return;
    }

    setUrlError(null);
    rememberSelection(
      normalized,
      normalized.replace(/^https?:\/\//, "").slice(0, 48),
      normalized.includes("unsplash.com") ? "unsplash" : "url",
    );
    setUrlDraft("");
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const source = await readFileAsDataUrl(file);
    const asset = addAsset(activeUserId, {
      kind: "cover",
      name: file.name,
      source,
      origin: "upload",
      mimeType: file.type,
      size: file.size,
    });
    onSelect(asset.source);
  }

  function renderLibrary() {
    if (activeTab !== "library") {
      return null;
    }

    if (reusableCovers.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-4 py-8 text-center text-sm text-[var(--osio-fg-muted)]">
          No saved cover assets yet.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        {reusableCovers.map((asset) => (
          <div key={asset.id} className="group relative">
            <CoverTile
              item={{
                id: asset.id,
                label: asset.name,
                ref: asset.source,
                previewUrl: asset.source,
                credit: asset.origin,
              }}
              selected={value === asset.source}
              onSelect={(item) => onSelect(item.ref)}
            />
            <button
              type="button"
              title="Remove asset"
              className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded bg-[var(--osio-bg-surface)] text-[var(--osio-danger)] shadow group-hover:flex"
              onClick={() => removeAsset(activeUserId, asset.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="cover-asset-picker"
      className="osionos-cover-picker rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-2xl"
    >
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

      {activeTab === "gallery" ? (
        <div className="px-3 pb-3 pt-2">
          <ImageAssetPickerPanel
            testId="cover-asset-picker-gallery"
            boardProps={COVER_PANEL_BOARD_PROPS}
            tabs={COVER_PICKER_TABS}
            value={value}
            label={label}
            height={284}
            onSelect={handleGallerySelect}
          />
        </div>
      ) : null}

      {activeTab === "gradients" ? (
        <div className="max-h-[284px] overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            {GRADIENT_COVERS.map((item) => (
              <CoverTile
                key={item.id}
                item={item}
                selected={value === item.ref}
                onSelect={(selectedItem) => selectAndRemember(selectedItem, "preloaded")}
              />
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "unsplash" ? (
        <div className="max-h-[284px] overflow-y-auto p-3">
          <div className="space-y-2">
            <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-xs text-[var(--osio-fg-muted)]">
              {unsplashLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              <input
                value={unsplashQuery}
                onChange={(event) => setUnsplashQuery(event.target.value)}
                placeholder="Search Unsplash"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(unsplashItems.length > 0 ? unsplashItems : UNSPLASH_COVER_ITEMS).map((item) => (
                <CoverTile
                  key={item.id}
                  item={item}
                  selected={value === item.ref}
                  onSelect={(selectedItem) => selectAndRemember(selectedItem, "unsplash")}
                />
              ))}
            </div>
            {unsplashLoaded && unsplashItems.length === 0 ? (
              <p className="text-[10px] text-[var(--osio-fg-subtle)]">
                Live Unsplash is waiting for the bridge key.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "url" ? (
        <div className="max-h-[284px] overflow-y-auto p-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2">
              <Link size={15} className="text-[var(--osio-fg-muted)]" />
              <input
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyUrl();
                  }
                }}
                placeholder="https://images.unsplash.com/..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
              />
            </div>
            {urlError ? (
              <p className="text-xs text-[var(--osio-danger)]">{urlError}</p>
            ) : null}
            <button
              type="button"
              className="w-full rounded-md bg-[var(--osio-accent)] px-3 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
              onClick={applyUrl}
            >
              Use URL
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "upload" ? (
        <div className="max-h-[284px] overflow-y-auto p-3">
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
        </div>
      ) : null}

      {activeTab === "library" ? (
        <div className="max-h-[284px] overflow-y-auto p-3">{renderLibrary()}</div>
      ) : null}
    </div>
  );
};
