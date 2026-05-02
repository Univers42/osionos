/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pickableImagePanelHarness.jsx                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: Codex <codex@openai.com>                   +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/02 00:00:00 by Codex             #+#    #+#             */
/*   Updated: 2026/05/02 00:00:00 by Codex            ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "@/app/styles/global.css";
import { CoverAssetPicker } from "@/entities/page/ui/CoverAssetPicker";
import { MediaAssetPicker } from "@/shared/ui/molecules/MediaAssetPicker";
import {
  COVER_PICKER_TABS,
  getSlashMediaPickerTabs,
  resolveCollectionMediaAsset,
} from "@/shared/lib/markengine/uiCollectionAssets";

function AssetSelectionState({ prefix, value, tabs, kind }) {
  const resolved = useMemo(
    () => resolveCollectionMediaAsset(value, tabs, prefix, kind),
    [kind, prefix, tabs, value],
  );

  return (
    <dl className="grid gap-2 text-xs text-[var(--color-ink-muted)]">
      <div>
        <dt className="font-semibold text-[var(--color-ink)]">Serialized</dt>
        <dd data-testid={`${prefix}-serialized`}>{value ?? ""}</dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--color-ink)]">URL</dt>
        <dd data-testid={`${prefix}-url`}>{resolved?.url ?? ""}</dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--color-ink)]">Full URL</dt>
        <dd data-testid={`${prefix}-full-url`}>{resolved?.fullUrl ?? ""}</dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--color-ink)]">Preview URL</dt>
        <dd data-testid={`${prefix}-preview-url`}>{resolved?.previewUrl ?? ""}</dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--color-ink)]">Thumbnail URL</dt>
        <dd data-testid={`${prefix}-thumbnail-url`}>{resolved?.thumbnailUrl ?? ""}</dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--color-ink)]">Poster URL</dt>
        <dd data-testid={`${prefix}-poster-url`}>{resolved?.posterUrl ?? ""}</dd>
      </div>
    </dl>
  );
}

function Section({ children, title, description, testId }) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-4 shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{description}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">{children}</div>
    </section>
  );
}

function App() {
  const [coverValue, setCoverValue] = useState();
  const [imageValue, setImageValue] = useState();
  const [videoValue, setVideoValue] = useState();

  return (
    <main className="min-h-screen bg-[var(--color-surface-secondary)] p-6">
      <div className="mx-auto grid max-w-7xl gap-6">
        <Section
          testId="cover-panel-section"
          title="Cover picker"
          description="Cover panel should expose thumbnails while resolving a larger selected cover URL."
        >
          <CoverAssetPicker value={coverValue} onSelect={setCoverValue} />
          <AssetSelectionState
            prefix="cover"
            value={coverValue}
            tabs={COVER_PICKER_TABS}
            kind="cover"
          />
        </Section>

        <Section
          testId="image-panel-section"
          title="Image picker"
          description="Image panel should expose pickable thumbnails and distinct preview/full URLs."
        >
          <MediaAssetPicker
            kind="image"
            testId="image-panel-picker"
            value={imageValue}
            height={360}
            onSelect={setImageValue}
          />
          <AssetSelectionState
            prefix="image"
            value={imageValue}
            tabs={getSlashMediaPickerTabs("image")}
            kind="image"
          />
        </Section>

        <Section
          testId="video-panel-section"
          title="Video picker"
          description="Video panel should keep video source separate from poster and thumbnail."
        >
          <MediaAssetPicker
            kind="video"
            testId="video-panel-picker"
            value={videoValue}
            height={360}
            onSelect={setVideoValue}
          />
          <AssetSelectionState
            prefix="video"
            value={videoValue}
            tabs={getSlashMediaPickerTabs("video")}
            kind="video"
          />
        </Section>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
