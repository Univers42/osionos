/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   uiCollectionMediaCatalog.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: Codex <codex@openai.com>                   +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/02 00:00:00 by Codex             #+#    #+#             */
/*   Updated: 2026/05/02 00:00:00 by Codex            ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  curatedImageCollections,
  curatedVideoCollections,
  images,
  videos,
  type ImageCollectionPreset,
  type NormalizedImage,
  type NormalizedVideo,
} from '@univers42/ui-collection';

export type UiCollectionMediaKind = 'image' | 'video' | 'audio' | 'file';

export interface UiCollectionMediaCatalogItem {
  id: string;
  kind: UiCollectionMediaKind;
  label: string;
  ref: string;
  thumbnailRef?: string;
  previewRef?: string;
  posterRef?: string;
  alt?: string;
  category?: string;
  tags?: string[];
  width?: number;
  height?: number;
  mimeType?: string;
}

function makeRemoteRef(url?: string): string | undefined {
  return url ? `url:${url}` : undefined;
}

function normalizeKeywords(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value?.split(/[;,]/).map((entry) => entry.trim()) ?? [])
        .filter(Boolean),
    ),
  );
}

function getStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function createImageCatalogItem(
  collection: ImageCollectionPreset,
  item: NormalizedImage,
): UiCollectionMediaCatalogItem | null {
  const fullUrl = images.resolveImageFullUrl(item);
  const previewUrl = images.resolveImagePreviewUrl(item);
  const thumbnailUrl = images.resolveImageThumbnailUrl(item);

  if (!fullUrl || !previewUrl || !thumbnailUrl) {
    return null;
  }

  return {
    id: item.id,
    kind: 'image',
    label: item.title ?? item.alt ?? collection.label,
    ref: makeRemoteRef(fullUrl) ?? '',
    thumbnailRef: makeRemoteRef(thumbnailUrl),
    previewRef: makeRemoteRef(previewUrl),
    alt: item.alt,
    category:
      getStringMetadata(item.metadata, 'category') ??
      collection.label,
    tags: normalizeKeywords([
      ...(collection.tags ?? []),
      ...(collection.queries ?? []),
      item.providerName,
      item.author,
      getStringMetadata(item.metadata, 'category'),
      getStringMetadata(item.metadata, 'theme'),
      getStringMetadata(item.metadata, 'style'),
      getStringMetadata(item.metadata, 'mission'),
      getStringMetadata(item.metadata, 'fileName'),
    ]),
    width: item.width,
    height: item.height,
  };
}

function createVideoCatalogItem(
  collectionId: string,
  collectionLabel: string,
  item: NormalizedVideo,
): UiCollectionMediaCatalogItem {
  return {
    id: item.id,
    kind: 'video',
    label: item.title,
    ref: makeRemoteRef(item.videoUrl) ?? '',
    thumbnailRef: makeRemoteRef(videos.resolveVideoThumbnailUrl(item)),
    previewRef: makeRemoteRef(videos.resolveVideoPreviewUrl(item)),
    posterRef: makeRemoteRef(videos.resolveVideoPosterUrl(item)),
    alt: item.title,
    category: collectionLabel,
    tags: normalizeKeywords([
      collectionId,
      collectionLabel,
      item.providerName,
      item.author,
      getStringMetadata(item.metadata, 'category'),
    ]),
    width: item.width,
    height: item.height,
    mimeType: item.mimeType,
  };
}

function dedupeCatalogItems(
  items: Array<UiCollectionMediaCatalogItem | null>,
): UiCollectionMediaCatalogItem[] {
  const uniqueItems = new Map<string, UiCollectionMediaCatalogItem>();

  for (const item of items) {
    if (!item || uniqueItems.has(item.id)) {
      continue;
    }
    uniqueItems.set(item.id, item);
  }

  return Array.from(uniqueItems.values());
}

export const COLLECTION_IMAGE_ITEMS: UiCollectionMediaCatalogItem[] = dedupeCatalogItems(
  curatedImageCollections.flatMap((collection) =>
    (collection.items ?? []).map((item) => createImageCatalogItem(collection, item)),
  ),
);

export const COLLECTION_COVER_ITEMS: UiCollectionMediaCatalogItem[] = COLLECTION_IMAGE_ITEMS;

export const COLLECTION_VIDEO_ITEMS: UiCollectionMediaCatalogItem[] = dedupeCatalogItems(
  curatedVideoCollections.flatMap((collection) =>
    collection.items.map((item) =>
      createVideoCatalogItem(collection.id, collection.label, item),
    ),
  ),
);

const imageFallback = COLLECTION_IMAGE_ITEMS[0];

export const COLLECTION_AUDIO_ITEMS: UiCollectionMediaCatalogItem[] = [
  {
    id: 'audio-soundhelix-1',
    kind: 'audio',
    label: 'SoundHelix Song 1',
    ref: makeRemoteRef('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3') ?? '',
    thumbnailRef: imageFallback?.thumbnailRef,
    posterRef: imageFallback?.previewRef,
    category: 'Audio',
    tags: ['audio', 'music', 'sample', 'ambient'],
    mimeType: 'audio/mpeg',
  },
  {
    id: 'audio-samplelib-3s',
    kind: 'audio',
    label: 'Samplelib 3s',
    ref: makeRemoteRef('https://samplelib.com/lib/preview/mp3/sample-3s.mp3') ?? '',
    thumbnailRef: COLLECTION_IMAGE_ITEMS[1]?.thumbnailRef ?? imageFallback?.thumbnailRef,
    posterRef: COLLECTION_IMAGE_ITEMS[1]?.previewRef ?? imageFallback?.previewRef,
    category: 'Audio',
    tags: ['audio', 'sample', 'preview', 'short'],
    mimeType: 'audio/mpeg',
  },
];

export const COLLECTION_FILE_ITEMS: UiCollectionMediaCatalogItem[] = [
  {
    id: 'file-w3c-dummy-pdf',
    kind: 'file',
    label: 'Dummy PDF',
    ref: makeRemoteRef(
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    ) ?? '',
    thumbnailRef: COLLECTION_IMAGE_ITEMS[2]?.thumbnailRef ?? imageFallback?.thumbnailRef,
    posterRef: COLLECTION_IMAGE_ITEMS[2]?.previewRef ?? imageFallback?.previewRef,
    category: 'Documents',
    tags: ['file', 'pdf', 'document', 'sample'],
    mimeType: 'application/pdf',
  },
  {
    id: 'file-iso-text',
    kind: 'file',
    label: 'Latin-1 Text',
    ref: makeRemoteRef('https://www.w3.org/TR/PNG/iso_8859-1.txt') ?? '',
    thumbnailRef: COLLECTION_IMAGE_ITEMS[3]?.thumbnailRef ?? imageFallback?.thumbnailRef,
    posterRef: COLLECTION_IMAGE_ITEMS[3]?.previewRef ?? imageFallback?.previewRef,
    category: 'Documents',
    tags: ['file', 'text', 'document', 'sample'],
    mimeType: 'text/plain',
  },
];
