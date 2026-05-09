/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   uiCollectionAssets.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:09 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/08 05:35:14 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  DEFAULT_EMOJI_PICKER_ITEMS,
  EMOJI_PICKER_GROUPS,
  SLASH_ITEMS as PACKAGE_SLASH_ITEMS,
  createDefaultAssetPickerTabs,
  createMediaCollectionPickerTab,
  resolveAssetValue,
  type AssetPickerBoardProps,
  type AssetPickerBoardTab,
  type SlashMenuItem as PackageSlashMenuItem,
} from '@univers42/ui-collection';
export { SECTION_LABELS as COLLECTION_SLASH_SECTION_LABELS } from '@univers42/ui-collection';
import type { BlockType, MediaBlockType } from '@/entities/block';
import {
  COLLECTION_AUDIO_ITEMS,
  COLLECTION_COVER_ITEMS,
  COLLECTION_FILE_ITEMS,
  COLLECTION_IMAGE_ITEMS,
  COLLECTION_VIDEO_ITEMS,
  type UiCollectionMediaCatalogItem,
  type UiCollectionMediaKind,
} from './uiCollectionMediaCatalog';

const DEFAULT_PAGE_EMOJI_PRESET_IDS = [
  'rocket',
  'idea',
  'package',
  'pin',
  'sparkles',
  'star',
  'palette',
  'tools',
] as const;

const EMOJI_BY_LIBRARY_ID = new Map(
  DEFAULT_EMOJI_PICKER_ITEMS.map((item) => [item.id, item.value] as const),
);

const LEGACY_EMOJI_PRESETS: Record<string, string> = {
  wave: EMOJI_BY_LIBRARY_ID.get('waving-hand') ?? '👋',
  'thumbs-up': EMOJI_BY_LIBRARY_ID.get('thumbs-up') ?? '👍',
  fire: EMOJI_BY_LIBRARY_ID.get('fire') ?? '🔥',
  sparkles: EMOJI_BY_LIBRARY_ID.get('sparkles') ?? '✨',
  rocket: EMOJI_BY_LIBRARY_ID.get('rocket') ?? '🚀',
  party: EMOJI_BY_LIBRARY_ID.get('party-face') ?? '🥳',
  check: EMOJI_BY_LIBRARY_ID.get('check-mark-button') ?? '✅',
  warning: EMOJI_BY_LIBRARY_ID.get('warning') ?? '⚠️',
  idea: EMOJI_BY_LIBRARY_ID.get('light-bulb') ?? '💡',
  brain: '🧠',
  palette: EMOJI_BY_LIBRARY_ID.get('artist-palette') ?? '🎨',
  package: EMOJI_BY_LIBRARY_ID.get('package') ?? '📦',
  pin: EMOJI_BY_LIBRARY_ID.get('pushpin') ?? '📌',
  paperclip: EMOJI_BY_LIBRARY_ID.get('paperclip') ?? '📎',
  puzzle: EMOJI_BY_LIBRARY_ID.get('puzzle-piece') ?? '🧩',
  tools: EMOJI_BY_LIBRARY_ID.get('toolbox') ?? '🧰',
  megaphone: '📣',
  heart: EMOJI_BY_LIBRARY_ID.get('red-heart') ?? '❤️',
  star: EMOJI_BY_LIBRARY_ID.get('star') ?? '⭐',
  moon: EMOJI_BY_LIBRARY_ID.get('moon') ?? '🌙',
  sun: EMOJI_BY_LIBRARY_ID.get('sun') ?? '☀️',
  leaf: EMOJI_BY_LIBRARY_ID.get('herb') ?? '🌿',
  robot: '🤖',
  cool: '😎',
};

const EMOJI_GROUP_LABELS: Record<string, string> = {
  [EMOJI_PICKER_GROUPS[0]]: 'Smileys',
  [EMOJI_PICKER_GROUPS[1]]: 'People',
  [EMOJI_PICKER_GROUPS[2]]: 'Animals',
  [EMOJI_PICKER_GROUPS[3]]: 'Food',
  [EMOJI_PICKER_GROUPS[4]]: 'Travel',
  [EMOJI_PICKER_GROUPS[5]]: 'Activities',
  [EMOJI_PICKER_GROUPS[6]]: 'Objects',
  [EMOJI_PICKER_GROUPS[7]]: 'Symbols',
  [EMOJI_PICKER_GROUPS[8]]: 'Flags',
};

const BOARD_ACTIVE_BACKGROUND = 'rgba(35, 131, 226, 0.12)';

export interface CoverPickerAsset {
  id: string;
  label: string;
  ref: string;
  previewUrl?: string;
  credit?: string;
  downloadLocation?: string;
  author?: string;
}

export const PRELOADED_COVER_ITEMS: CoverPickerAsset[] = [
  {
    id: 'cover-preloaded-studio',
    label: 'Studio desk',
    ref: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=720&q=70',
    credit: 'Unsplash',
  },
  {
    id: 'cover-preloaded-library',
    label: 'Library shelves',
    ref: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1800&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=720&q=70',
    credit: 'Unsplash',
  },
  {
    id: 'cover-preloaded-canyon',
    label: 'Desert canyon',
    ref: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=720&q=70',
    credit: 'Unsplash',
  },
  {
    id: 'cover-preloaded-night-city',
    label: 'Night city',
    ref: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1800&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=720&q=70',
    credit: 'Unsplash',
  },
];

export const UNSPLASH_COVER_ITEMS: CoverPickerAsset[] = [
  {
    id: 'cover-unsplash-people-workspace',
    label: 'People workspace',
    ref: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=720&q=70',
    credit: 'Unsplash',
  },
  {
    id: 'cover-unsplash-portrait-warm',
    label: 'Portrait study',
    ref: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1800&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=720&q=70',
    credit: 'Unsplash',
  },
  {
    id: 'cover-unsplash-portrait-city',
    label: 'City portrait',
    ref: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1800&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=720&q=70',
    credit: 'Unsplash',
  },
];

const FALLBACK_COVER_ITEMS = [
  ...PRELOADED_COVER_ITEMS,
  { id: 'cover-aurora', label: 'Aurora', ref: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)' },
  { id: 'cover-sunset', label: 'Sunset', ref: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' },
  { id: 'cover-forest', label: 'Forest', ref: 'linear-gradient(135deg, #16a34a 0%, #0f766e 100%)' },
  { id: 'cover-slate', label: 'Slate', ref: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)' },
  { id: 'cover-lagoon', label: 'Lagoon', ref: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)' },
  { id: 'cover-rose', label: 'Rose', ref: 'linear-gradient(135deg, #fb7185 0%, #be123c 100%)' },
  { id: 'cover-gold', label: 'Gold', ref: 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)' },
  { id: 'cover-night', label: 'Night', ref: 'radial-gradient(circle at top, #475569 0%, #020617 70%)' },
] as const;

const COLLECTION_SVG_ITEMS: Array<unknown> = [];

const BOARD_CLASS_NAMES: NonNullable<AssetPickerBoardProps['classNames']> = {
  root: 'w-full',
  searchInput: 'placeholder:text-[var(--osio-fg-subtle)]',
};

const BOARD_STYLES: NonNullable<AssetPickerBoardProps['styles']> = {
  root: {
    padding: 0,
    borderRadius: 12,
    border: '1px solid var(--osio-border-default)',
    background: 'var(--osio-bg-surface)',
    color: 'var(--osio-fg-default)',
    boxShadow: '0 18px 48px rgba(15, 23, 42, 0.16)',
    overflow: 'hidden',
  },
  tabList: {
    gap: 6,
    marginBottom: 0,
    padding: '8px 8px 0',
    borderBottom: '1px solid var(--osio-border-default)',
  },
  tabButton: {
    color: 'var(--osio-fg-default)',
    borderRadius: 8,
  },
  searchField: {
    gap: 0,
    marginBottom: 0,
    padding: '8px',
    borderBottom: '1px solid var(--osio-border-default)',
  },
  searchLabel: {
    display: 'none',
  },
  searchInput: {
    height: 36,
    borderRadius: 8,
    border: '1px solid var(--osio-border-default)',
    background: 'var(--osio-bg-subtle)',
    color: 'var(--osio-fg-default)',
    padding: '0 12px',
    fontSize: 10,
  },
  groupSection: {
    gap: 8,
    marginBottom: 16,
  },
  groupLabel: {
    padding: '0 4px',
    color: 'var(--osio-fg-muted)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  grid: {
    padding: '4px 8px 8px',
  },
  itemButton: {
    color: 'var(--osio-fg-default)',
    borderRadius: 8,
  },
  itemLabel: {
    color: 'var(--osio-fg-muted)',
    fontSize: 10,
    lineHeight: 1.25,
  },
  emptyState: {
    minHeight: 96,
    padding: '24px 16px',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: 'var(--osio-fg-muted)',
  },
};

export const PAGE_ICON_PICKER_BOARD_PROPS: Partial<AssetPickerBoardProps> = {
  appearance: 'default',
  showHeader: false,
  showSelectionPreview: false,
  showStatusBar: false,
  classNames: BOARD_CLASS_NAMES,
  styles: BOARD_STYLES,
};

export const COVER_PICKER_BOARD_PROPS: Partial<AssetPickerBoardProps> = {
  ...PAGE_ICON_PICKER_BOARD_PROPS,
  showTabs: false,
};

export const SLASH_MEDIA_PICKER_BOARD_PROPS: Partial<AssetPickerBoardProps> = {
  ...PAGE_ICON_PICKER_BOARD_PROPS,
  showHeader: false,
  showSelectionPreview: false,
  showStatusBar: false,
  showTabs: false,
  styles: {
    ...PAGE_ICON_PICKER_BOARD_PROPS.styles,
    root: {
      ...PAGE_ICON_PICKER_BOARD_PROPS.styles?.root,
      border: 'none',
      borderRadius: 0,
      background: 'transparent',
      boxShadow: 'none',
    },
    searchField: {
      ...PAGE_ICON_PICKER_BOARD_PROPS.styles?.searchField,
      padding: '10px 12px 8px',
    },
    grid: {
      ...PAGE_ICON_PICKER_BOARD_PROPS.styles?.grid,
      padding: '4px 12px 12px',
    },
  },
};

export const PAGE_ICON_PICKER_TABS: AssetPickerBoardTab[] =
  createDefaultAssetPickerTabs({
    svgItems: COLLECTION_SVG_ITEMS,
    emojiTabOptions: {
      label: 'Emoji',
      itemLabelVisibility: 'hidden',
      showGroups: true,
      groupOrder: [...EMOJI_PICKER_GROUPS],
      groupLabels: EMOJI_GROUP_LABELS,
      activeBackground: BOARD_ACTIVE_BACKGROUND,
    },
    svgTabOptions: {
      label: 'SVG',
      columns: 5,
      layout: 'icon',
      itemLabelVisibility: 'hidden',
      activeBackground: BOARD_ACTIVE_BACKGROUND,
      searchLabel: 'Search SVG assets',
      searchPlaceholder: 'Search by name, category or tag',
    },
    iconTabOptions: {
      label: 'Icons',
      columns: 5,
      itemLabelVisibility: 'hidden',
      activeBackground: BOARD_ACTIVE_BACKGROUND,
      searchLabel: 'Search icons',
      searchPlaceholder: 'Search by name or keyword',
    },
  });

export const COVER_PICKER_TABS: AssetPickerBoardTab[] = [
  createMediaCollectionPickerTab('photos', COLLECTION_COVER_ITEMS, {
    label: 'Photos',
    columns: 2,
    layout: 'cover',
    itemLabelVisibility: 'visible',
    activeBackground: BOARD_ACTIVE_BACKGROUND,
    searchLabel: 'Search covers',
    searchPlaceholder: 'Search by mood, category or tag',
  }),
];

const MEDIA_PICKER_TAB_OPTIONS = {
  activeBackground: BOARD_ACTIVE_BACKGROUND,
  itemLabelVisibility: 'visible',
} as const;

function createImageMediaPickerTabs(
  items: Array<unknown> = COLLECTION_IMAGE_ITEMS,
): AssetPickerBoardTab[] {
  return [
    createMediaCollectionPickerTab('photos', items, {
      label: 'Images',
      columns: 2,
      layout: 'cover',
      searchLabel: 'Search images',
      searchPlaceholder: 'Search by mood, category or tag',
      ...MEDIA_PICKER_TAB_OPTIONS,
    }),
  ];
}

export const IMAGE_PICKER_TABS: AssetPickerBoardTab[] = createImageMediaPickerTabs();

export const SLASH_MEDIA_PICKER_TABS: Record<MediaBlockType, AssetPickerBoardTab[]> = {
  image: IMAGE_PICKER_TABS,
  video: [
    createMediaCollectionPickerTab('videos', COLLECTION_VIDEO_ITEMS, {
      label: 'Videos',
      columns: 2,
      layout: 'media',
      searchLabel: 'Search videos',
      searchPlaceholder: 'Search videos by title or keyword',
      ...MEDIA_PICKER_TAB_OPTIONS,
    }),
  ],
  audio: [
    createMediaCollectionPickerTab('other-media', COLLECTION_AUDIO_ITEMS, {
      id: 'audio',
      label: 'Audio',
      columns: 1,
      layout: 'media',
      searchLabel: 'Search audio',
      searchPlaceholder: 'Search tracks or audio keywords',
      ...MEDIA_PICKER_TAB_OPTIONS,
    }),
  ],
  file: [
    createMediaCollectionPickerTab('other-media', COLLECTION_FILE_ITEMS, {
      id: 'file',
      label: 'Files',
      columns: 1,
      layout: 'media',
      searchLabel: 'Search files',
      searchPlaceholder: 'Search documents or files',
      ...MEDIA_PICKER_TAB_OPTIONS,
    }),
  ],
};

export function getSlashMediaPickerTabs(
  kind: MediaBlockType,
  dynamicImageItems: Array<unknown> = [],
): AssetPickerBoardTab[] {
  if (kind === 'image' && dynamicImageItems.length > 0) {
    return createImageMediaPickerTabs(dynamicImageItems);
  }
  return SLASH_MEDIA_PICKER_TABS[kind];
}

export interface ResolvedCollectionMediaAsset {
  label?: string;
  url?: string;
  fullUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  posterUrl?: string;
  mediaKind?: UiCollectionMediaKind;
}

function resolveRemoteValue(ref?: string): string | undefined {
  if (!ref) {
    return undefined;
  }

  if (ref.startsWith('url:')) {
    return ref.slice('url:'.length);
  }

  if (/^https?:\/\//i.test(ref)) {
    return ref;
  }

  return undefined;
}

function normalizeCollectionMediaKind(
  kind?: UiCollectionMediaKind | MediaBlockType | 'cover',
): UiCollectionMediaKind | 'cover' | undefined {
  if (!kind) {
    return undefined;
  }

  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'file') {
    return kind;
  }

  return 'cover';
}

export function normalizeMediaSource(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('url:')) return value.slice(4);
  return value;
}

function isDirectMediaSource(value: string): boolean {
  const source = normalizeMediaSource(value) ?? value;
  return /^(https?:|data:|blob:)/i.test(source);
}

export function resolveCollectionMediaAsset(
  value: string | undefined,
  tabs: AssetPickerBoardTab[],
  fallbackLabel?: string,
  kind?: UiCollectionMediaKind | MediaBlockType | 'cover',
): ResolvedCollectionMediaAsset | null {
  if (!value) {
    return null;
  }

  const resolved = resolveAssetValue(value, tabs);
  if (!resolved) {
    if (!isDirectMediaSource(value)) {
      return null;
    }

    const source = normalizeMediaSource(value);
    const resolvedKind = normalizeCollectionMediaKind(kind);
    return {
      label: fallbackLabel,
      url: source,
      fullUrl: source,
      previewUrl:
        resolvedKind === 'image' || resolvedKind === 'cover' ? source : undefined,
      thumbnailUrl:
        resolvedKind === 'image' || resolvedKind === 'cover' ? source : undefined,
      mediaKind: resolvedKind === 'cover' ? 'image' : resolvedKind,
    };
  }

  const itemData = resolved.item?.data as UiCollectionMediaCatalogItem | undefined;
  const resolvedKind = itemData?.kind ?? normalizeCollectionMediaKind(kind);
  const fallbackUrl = resolveRemoteValue(resolved.serializedValue);
  const previewImageUrl = resolved.preview?.kind === 'image' ? resolved.preview.src : undefined;
  const fullUrl = resolveRemoteValue(itemData?.ref) ?? fallbackUrl;
  const previewUrl =
    resolveRemoteValue(itemData?.previewRef) ??
    (resolvedKind === 'video' ? undefined : fullUrl ?? previewImageUrl);
  const thumbnailUrl =
    resolveRemoteValue(itemData?.thumbnailRef) ??
    (resolvedKind === 'image' || resolvedKind === 'cover' ? previewImageUrl : undefined);
  const posterUrl =
    resolveRemoteValue(itemData?.posterRef) ??
    resolveRemoteValue(itemData?.thumbnailRef) ??
    (resolvedKind === 'video' ? previewImageUrl : undefined);

  return {
    label: resolved.item?.label ?? fallbackLabel,
    url:
      resolvedKind === 'video' || resolvedKind === 'audio' || resolvedKind === 'file'
        ? fullUrl
        : previewUrl ?? fullUrl ?? previewImageUrl,
    fullUrl,
    previewUrl,
    thumbnailUrl,
    posterUrl,
    mediaKind: resolvedKind === 'cover' ? 'image' : resolvedKind,
  };
}

export function getCollectionEmojiValue(id: string, fallback = '✨'): string {
  return LEGACY_EMOJI_PRESETS[id] ?? EMOJI_BY_LIBRARY_ID.get(id) ?? fallback;
}

export function randomUiCollectionEmoji(): string {
  const id =
    DEFAULT_PAGE_EMOJI_PRESET_IDS[
      Math.floor(Math.random() * DEFAULT_PAGE_EMOJI_PRESET_IDS.length)
    ];
  return getCollectionEmojiValue(id);
}

export function randomUiCollectionCover(): string | undefined {
  const item = FALLBACK_COVER_ITEMS[
    Math.floor(Math.random() * FALLBACK_COVER_ITEMS.length)
  ];
  return item.ref;
}

const SUPPORTED_SLASH_TYPES = new Set<BlockType>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'heading_4',
  'heading_5',
  'heading_6',
  'bulleted_list',
  'numbered_list',
  'to_do',
  'toggle',
  'image',
  'video',
  'audio',
  'file',
  'code',
  'quote',
  'callout',
  'divider',
  'table_block',
  'database_inline',
  'database_full_page',
]);

export const COLLECTION_SLASH_ITEMS = PACKAGE_SLASH_ITEMS.filter(
  (
    item,
  ): item is PackageSlashMenuItem & {
    type: BlockType;
  } => {
    if (!SUPPORTED_SLASH_TYPES.has(item.type as BlockType)) {
      return false;
    }

    if (item.type !== 'callout') {
      return true;
    }

    const firstCallout = PACKAGE_SLASH_ITEMS.find(
      (candidate) => candidate.type === 'callout',
    );

    return firstCallout === item;
  },
);

export const COLLECTION_PAGE_SLASH_ITEM =
  PACKAGE_SLASH_ITEMS.find((item) => item.type === 'page') ?? null;

export const COLLECTION_ROLE_BADGES: Record<string, string> = {
  admin: getCollectionEmojiValue('star'),
  collaborator: getCollectionEmojiValue('palette'),
  member: getCollectionEmojiValue('palette'),
  guest: getCollectionEmojiValue('cool'),
};

export { IconBoard, IconImage, IconPage, IconTable } from '@univers42/ui-collection';
