/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaEmbedDialog.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef, useState } from "react";

import type { MediaBlockType } from "@/entities/block";
import { Modal } from "@/shared/ui/primitives/Modal";
import { MiniTabs } from "@/shared/ui/primitives/MiniTabs";
import { Button } from "@/shared/ui";
import { useUserStore } from "@/features/auth";
import { useAssetLibraryStore } from "@/shared/config/assetLibraryStore";
import { searchUnsplashPickerAssets } from "@/shared/lib/media/unsplash";
import { giphyEnabled } from "@/shared/chat/giphyApi";
import { GifPicker } from "@/widgets/channel-messages/ui/composer/GifPicker";

type EmbedTab = "upload" | "link" | "unsplash" | "giphy";

interface MediaEmbedDialogProps {
  kind: MediaBlockType;
  onSelect: (value: string) => void;
  onClose: () => void;
}

const ACCEPT: Record<MediaBlockType, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  file: "*/*",
};

const UPLOAD_LABEL: Record<MediaBlockType, string> = {
  image: "Choose an image",
  video: "Choose a video",
  audio: "Choose audio",
  file: "Choose a file",
};

const LINK_LABEL: Record<MediaBlockType, string> = {
  image: "Embed image",
  video: "Embed video",
  audio: "Embed audio",
  file: "Embed link",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export const MediaEmbedDialog: React.FC<MediaEmbedDialogProps> = ({ kind, onSelect, onClose }) => {
  const activeUserId = useUserStore((s) => s.activeUserId) ?? "anonymous";
  const addAsset = useAssetLibraryStore((s) => s.addAsset);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const tabs = useMemo<EmbedTab[]>(() => {
    if (kind !== "image") return ["upload", "link"];
    return giphyEnabled() ? ["upload", "link", "unsplash", "giphy"] : ["upload", "link", "unsplash"];
  }, [kind]);
  const [tab, setTab] = useState<EmbedTab>(tabs[0]);

  const [urlDraft, setUrlDraft] = useState("");
  const [unsplashQuery, setUnsplashQuery] = useState("");
  const [unsplash, setUnsplash] = useState<Array<{ ref: string; previewUrl: string }>>([]);
  const [busy, setBusy] = useState(false);

  function commit(value: string) {
    onSelect(value);
    onClose();
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const source = await readFileAsDataUrl(file);
      const asset = addAsset(activeUserId, { kind, name: file.name, source, origin: "upload" });
      commit(asset.source.startsWith("url:") ? asset.source : `url:${asset.source}`);
    } finally {
      setBusy(false);
    }
  }

  function handleLink() {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    commit(`url:${trimmed}`);
  }

  async function runUnsplash(query: string) {
    setBusy(true);
    try {
      const items = await searchUnsplashPickerAssets({ query: query || "workspace", perPage: 24 });
      setUnsplash(items.map((item) => ({ ref: item.ref, previewUrl: item.previewUrl ?? item.ref })));
    } finally {
      setBusy(false);
    }
  }

  const title = kind === "video" ? "Embed or upload a video" : `Add ${kind === "image" ? "an image" : `a ${kind}`}`;

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--osio-fg-strong)]">{title}</h2>
        </div>

        <MiniTabs
          value={tab}
          onChange={(next) => {
            setTab(next);
            if (next === "unsplash" && unsplash.length === 0) void runUnsplash(unsplashQuery);
          }}
          options={tabs.map((id) => ({ value: id, label: id.charAt(0).toUpperCase() + id.slice(1) }))}
        />

        {tab === "upload" ? (
          <div className="flex flex-col items-center gap-3 rounded-[var(--osio-radius-panel)] border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--osio-fg-muted)]">Upload {kind === "image" ? "an image" : `a ${kind}`} from your device.</p>
            <input ref={fileRef} type="file" accept={ACCEPT[kind]} className="hidden" onChange={handleUpload} />
            <Button tone="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {UPLOAD_LABEL[kind]}
            </Button>
          </div>
        ) : null}

        {tab === "link" ? (
          <div className="flex flex-col gap-2">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLink(); }}
              placeholder={`Paste the ${kind} link…`}
              className="h-[var(--osio-control-h-md)] w-full rounded-[var(--osio-radius-control)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)]"
            />
            <Button tone="primary" disabled={!urlDraft.trim()} onClick={handleLink}>{LINK_LABEL[kind]}</Button>
          </div>
        ) : null}

        {tab === "unsplash" ? (
          <div className="flex flex-col gap-2">
            <input
              type="search"
              aria-label="Search Unsplash images"
              value={unsplashQuery}
              onChange={(e) => setUnsplashQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runUnsplash(unsplashQuery); }}
              placeholder="Search Unsplash…"
              className="h-[var(--osio-control-h-md)] w-full rounded-[var(--osio-radius-control)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
            />
            <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
              {unsplash.map((item) => (
                <button
                  key={item.ref}
                  type="button"
                  onClick={() => commit(`url:${item.ref}`)}
                  aria-label="Insert this Unsplash image"
                  className="aspect-square overflow-hidden rounded-[var(--osio-radius-control)] border border-[var(--osio-border-default)] transition-transform hover:scale-[1.02]"
                >
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "giphy" ? (
          <div className="max-h-64 overflow-y-auto">
            <GifPicker onPick={(gif) => commit(`url:${gif.fullUrl}`)} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
};
