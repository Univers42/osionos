/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   uiCollectionAssets.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:21:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:21:18 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  DEFAULT_EMOJI_PICKER_ITEMS,
  EMOJI_PICKER_GROUPS,
  SLASH_ITEMS as PACKAGE_SLASH_ITEMS,
  createDefaultAssetPickerTabs,
  createMediaCollectionPickerTab,
  getMediaCollection,
  resolveAssetValue,
  resolveMediaUrl,
  type AssetPickerBoardProps,
  type AssetPickerBoardTab,
  type MediaItem,
  type SlashMenuItem as PackageSlashMenuItem,
} from '@univers42/ui-collection';
export { SECTION_LABELS as COLLECTION_SLASH_SECTION_LABELS } from '@univers42/ui-collection';
import type { BlockType, MediaBlockType } from '@/entities/block';

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
const MEDIA_PROVIDER_ALLOWLIST = new Set(['url', 'package']);
const COLLECTION_SVG_ITEMS = getMediaCollection('svg').filter(
  (item) => !item.ref.startsWith('local:'),
);
const COLLECTION_COVER_ITEMS = getMediaCollection('photos').filter(
  (item) => !item.ref.startsWith('local:'),
);
const COLLECTION_IMAGE_ITEMS = getMediaCollection('photos').filter(isResolvableMediaItem);
const COLLECTION_VIDEO_ITEMS = getMediaCollection('videos').filter(isResolvableMediaItem);
const COLLECTION_AUDIO_ITEMS = getMediaCollection('other-media').filter(
  (item) => item.kind === 'audio' && isResolvableMediaItem(item),
);
const COLLECTION_FILE_ITEMS = getMediaCollection('other-media').filter(
  (item) => item.kind === 'document' && isResolvableMediaItem(item),
);

function isResolvableMediaItem(item: MediaItem): boolean {
  const provider = item.ref.split(':', 1)[0];
  return MEDIA_PROVIDER_ALLOWLIST.has(provider);
}

const BOARD_CLASS_NAMES: NonNullable<AssetPickerBoardProps['classNames']> = {
  root: 'w-full',
  searchInput: 'placeholder:text-[var(--color-ink-faint)]',
};

const BOARD_STYLES: NonNullable<AssetPickerBoardProps['styles']> = {
  root: {
    padding: 0,
    borderRadius: 12,
    border: '1px solid var(--color-line)',
    background: 'var(--color-surface-primary)',
    color: 'var(--color-ink)',
    boxShadow: '0 18px 48px rgba(15, 23, 42, 0.16)',
    overflow: 'hidden',
  },
  tabList: {
    gap: 6,
    marginBottom: 0,
    padding: '8px 8px 0',
    borderBottom: '1px solid var(--color-line)',
  },
  tabButton: {
    color: 'var(--color-ink)',
    borderRadius: 8,
  },
  searchField: {
    gap: 0,
    marginBottom: 0,
    padding: '8px',
    borderBottom: '1px solid var(--color-line)',
  },
  searchLabel: {
    display: 'none',
  },
  searchInput: {
    height: 36,
    borderRadius: 8,
    border: '1px solid var(--color-line)',
    background: 'var(--color-surface-secondary)',
    color: 'var(--color-ink)',
    padding: '0 12px',
    fontSize: 10,
  },
  groupSection: {
    gap: 8,
    marginBottom: 16,
  },
  groupLabel: {
    padding: '0 4px',
    color: 'var(--color-ink-muted)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  grid: {
    padding: '4px 8px 8px',
  },
  itemButton: {
    color: 'var(--color-ink)',
    borderRadius: 8,
  },
  itemLabel: {
    color: 'var(--color-ink-muted)',
    fontSize: 10,
    lineHeight: 1.25,
  },
  emptyState: {
    minHeight: 96,
    padding: '24px 16px',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: 'var(--color-ink-muted)',
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

export const COVER_PICKER_TABS: AssetPickerBoardTab[] =
  COLLECTION_COVER_ITEMS.length > 0
    ? [
        createMediaCollectionPickerTab('photos', COLLECTION_COVER_ITEMS, {
          label: 'Photos',
          columns: 2,
          itemLabelVisibility: 'hidden',
          activeBackground: BOARD_ACTIVE_BACKGROUND,
          searchLabel: 'Search photos',
          searchPlaceholder: 'Search by mood, category or tag',
        }),
      ]
    : [];

const MEDIA_PICKER_TAB_OPTIONS = {
  activeBackground: BOARD_ACTIVE_BACKGROUND,
  itemLabelVisibility: 'hidden',
} as const;

export const SLASH_MEDIA_PICKER_TABS: Record<MediaBlockType, AssetPickerBoardTab[]> = {
  image: [
    createMediaCollectionPickerTab('photos', COLLECTION_IMAGE_ITEMS, {
      label: 'Images',
      columns: 2,
      layout: 'cover',
      searchLabel: 'Search images',
      searchPlaceholder: 'Search photos by mood or keyword',
      ...MEDIA_PICKER_TAB_OPTIONS,
    }),
  ],
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

export function getSlashMediaPickerTabs(kind: MediaBlockType): AssetPickerBoardTab[] {
  return SLASH_MEDIA_PICKER_TABS[kind];
}

export interface ResolvedCollectionMediaAsset {
  label?: string;
  url?: string;
  thumbnailUrl?: string;
}

export function resolveCollectionMediaAsset(
  value: string | undefined,
  tabs: AssetPickerBoardTab[],
  fallbackLabel?: string,
): ResolvedCollectionMediaAsset | null {
  if (!value) {
    return null;
  }

  const resolved = resolveAssetValue(value, tabs);
  if (!resolved) {
    return null;
  }

  const mediaItem = resolved.mediaItem;
  const previewImageUrl =
    resolved.preview?.kind === 'image' ? resolved.preview.src : undefined;

  return {
    label: resolved.item?.label ?? mediaItem?.label ?? fallbackLabel,
    url: mediaItem ? resolveMediaUrl(mediaItem.ref) : previewImageUrl,
    thumbnailUrl: mediaItem?.thumbnailRef
      ? resolveMediaUrl(mediaItem.thumbnailRef)
      : previewImageUrl,
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
  if (COLLECTION_COVER_ITEMS.length === 0) {
    return undefined;
  }

  return COLLECTION_COVER_ITEMS[
    Math.floor(Math.random() * COLLECTION_COVER_ITEMS.length)
  ]?.ref;
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
