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

function makeRemoteRef(url: string): string {
  return `url:${url}`;
}

function makeUnsplashUrl(
  photoId: string,
  width: number,
  height: number,
  quality = 80,
): string {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&h=${height}&q=${quality}`;
}

function createUnsplashImage(
  id: string,
  label: string,
  photoId: string,
  options: {
    category: string;
    tags: string[];
    alt: string;
    width?: number;
    height?: number;
    previewWidth?: number;
    previewHeight?: number;
    thumbWidth?: number;
    thumbHeight?: number;
  },
): UiCollectionMediaCatalogItem {
  const width = options.width ?? 1600;
  const height = options.height ?? 900;
  const previewWidth = options.previewWidth ?? 1280;
  const previewHeight = options.previewHeight ?? 720;
  const thumbWidth = options.thumbWidth ?? 320;
  const thumbHeight = options.thumbHeight ?? 180;

  return {
    id,
    kind: 'image',
    label,
    ref: makeRemoteRef(makeUnsplashUrl(photoId, width, height)),
    previewRef: makeRemoteRef(makeUnsplashUrl(photoId, previewWidth, previewHeight)),
    thumbnailRef: makeRemoteRef(makeUnsplashUrl(photoId, thumbWidth, thumbHeight, 72)),
    alt: options.alt,
    category: options.category,
    tags: options.tags,
    width,
    height,
  };
}

const CURATED_IMAGE_ITEMS: UiCollectionMediaCatalogItem[] = [
  createUnsplashImage('mountain-blue', 'Mountain Blue', 'photo-1506905925346-21bda4d32df4', {
    category: 'Nature',
    tags: ['mountain', 'alps', 'snow', 'landscape', 'blue'],
    alt: 'Snowy mountain ridge under a blue sky',
  }),
  createUnsplashImage('forest-green', 'Forest Green', 'photo-1441974231531-c6227db76b6e', {
    category: 'Nature',
    tags: ['forest', 'trees', 'woods', 'green', 'nature'],
    alt: 'Dense green forest viewed from above',
  }),
  createUnsplashImage('sunset-orange', 'Sunset Orange', 'photo-1495567720989-cebdbdd97913', {
    category: 'Nature',
    tags: ['sunset', 'sky', 'orange', 'landscape', 'light'],
    alt: 'Warm sunset sky over a soft horizon',
  }),
  createUnsplashImage('ocean-wave', 'Ocean Wave', 'photo-1505142468610-359e7d316be0', {
    category: 'Nature',
    tags: ['ocean', 'sea', 'wave', 'blue', 'water'],
    alt: 'Rolling ocean waves under clear light',
  }),
  createUnsplashImage('desert-sand', 'Desert Sand', 'photo-1469854523086-cc02fe5d8800', {
    category: 'Travel',
    tags: ['desert', 'road', 'sand', 'travel', 'warm'],
    alt: 'Desert road cutting through warm sand tones',
  }),
  createUnsplashImage('city-lights', 'City Lights', 'photo-1449824913935-59a10b8d2000', {
    category: 'Urban',
    tags: ['city', 'night', 'urban', 'lights', 'street'],
    alt: 'City street lights glowing at dusk',
  }),
  createUnsplashImage('aurora-north', 'Aurora North', 'photo-1444080748397-f442aa95c3e5', {
    category: 'Space',
    tags: ['aurora', 'night', 'sky', 'northern lights', 'space'],
    alt: 'Northern lights stretching across a dark sky',
  }),
  createUnsplashImage('flower-spring', 'Flower Spring', 'photo-1490841573885-cd78ccee5912', {
    category: 'Nature',
    tags: ['flowers', 'spring', 'field', 'nature', 'pink'],
    alt: 'Spring flowers in a bright field',
  }),
  createUnsplashImage('workspace-minimal', 'Workspace Minimal', 'photo-1497366754035-f200968a6e72', {
    category: 'Workspace',
    tags: ['workspace', 'desk', 'laptop', 'minimal', 'interior'],
    alt: 'Minimal workspace with a laptop and notebook',
  }),
  createUnsplashImage('abstract-shadow', 'Abstract Shadow', 'photo-1511300636408-a63a89df3482', {
    category: 'Abstract',
    tags: ['abstract', 'light', 'shadow', 'texture', 'minimal'],
    alt: 'Abstract light and shadow texture',
  }),
];

const [mountainBlue, forestGreen, sunsetOrange, oceanWave, desertSand, cityLights, auroraNorth, flowerSpring, workspaceMinimal, abstractShadow] =
  CURATED_IMAGE_ITEMS;

export const COLLECTION_COVER_ITEMS: UiCollectionMediaCatalogItem[] = [
  mountainBlue,
  forestGreen,
  sunsetOrange,
  oceanWave,
  desertSand,
  cityLights,
  auroraNorth,
  flowerSpring,
];

export const COLLECTION_IMAGE_ITEMS: UiCollectionMediaCatalogItem[] = CURATED_IMAGE_ITEMS;

export const COLLECTION_VIDEO_ITEMS: UiCollectionMediaCatalogItem[] = [
  {
    id: 'video-big-buck-bunny',
    kind: 'video',
    label: 'Big Buck Bunny',
    ref: makeRemoteRef(
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    ),
    thumbnailRef: mountainBlue.thumbnailRef,
    posterRef: mountainBlue.previewRef,
    category: 'Demo videos',
    tags: ['animation', 'sample', 'demo', 'rabbit'],
    width: 1280,
    height: 720,
    mimeType: 'video/mp4',
  },
  {
    id: 'video-elephants-dream',
    kind: 'video',
    label: 'Elephants Dream',
    ref: makeRemoteRef(
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    ),
    thumbnailRef: cityLights.thumbnailRef,
    posterRef: cityLights.previewRef,
    category: 'Demo videos',
    tags: ['animation', 'sample', 'dream', 'cinematic'],
    width: 1280,
    height: 720,
    mimeType: 'video/mp4',
  },
  {
    id: 'video-for-bigger-escapes',
    kind: 'video',
    label: 'For Bigger Escapes',
    ref: makeRemoteRef(
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    ),
    thumbnailRef: auroraNorth.thumbnailRef,
    posterRef: auroraNorth.previewRef,
    category: 'Travel videos',
    tags: ['travel', 'sample', 'landscape', 'escape'],
    width: 1280,
    height: 720,
    mimeType: 'video/mp4',
  },
];

export const COLLECTION_AUDIO_ITEMS: UiCollectionMediaCatalogItem[] = [
  {
    id: 'audio-soundhelix-1',
    kind: 'audio',
    label: 'SoundHelix Song 1',
    ref: makeRemoteRef('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
    thumbnailRef: abstractShadow.thumbnailRef,
    posterRef: abstractShadow.previewRef,
    category: 'Audio',
    tags: ['audio', 'music', 'sample', 'ambient'],
    mimeType: 'audio/mpeg',
  },
  {
    id: 'audio-samplelib-3s',
    kind: 'audio',
    label: 'Samplelib 3s',
    ref: makeRemoteRef('https://samplelib.com/lib/preview/mp3/sample-3s.mp3'),
    thumbnailRef: oceanWave.thumbnailRef,
    posterRef: oceanWave.previewRef,
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
    ),
    thumbnailRef: workspaceMinimal.thumbnailRef,
    posterRef: workspaceMinimal.previewRef,
    category: 'Documents',
    tags: ['file', 'pdf', 'document', 'sample'],
    mimeType: 'application/pdf',
  },
  {
    id: 'file-iso-text',
    kind: 'file',
    label: 'Latin-1 Text',
    ref: makeRemoteRef('https://www.w3.org/TR/PNG/iso_8859-1.txt'),
    thumbnailRef: desertSand.thumbnailRef,
    posterRef: desertSand.previewRef,
    category: 'Documents',
    tags: ['file', 'text', 'document', 'sample'],
    mimeType: 'text/plain',
  },
];
