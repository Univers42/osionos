import React from 'react';
import {
  AssetPickerBoard,
  DEFAULT_EMOJI_PICKER_ITEMS,
  DEFAULT_ICON_PICKER_ITEMS,
  IconBoard,
  IconImage,
  IconPage,
  IconTable,
  SLASH_ITEMS as PACKAGE_SLASH_ITEMS,
  getMediaCollection,
  renderSizedIcon,
  resolveMediaUrl,
  type AssetPickerBoardSelection,
  type AssetPickerBoardTab,
  type AssetPickerBoardValue,
  type IconPickerItem,
  type MediaItem,
  type SlashMenuItem as PackageSlashMenuItem,
} from '@univers42/ui-collection';
import {
  createEmojiPickerTab,
  createIconPickerTab,
  createMediaCollectionPickerTab,
} from '@univers42/ui-collection/library/components/react/asset-picker';
import type { BlockType } from '@/entities/block';
import { SVG_ICONS as LEGACY_SVG_ICONS } from '@/shared/ui/molecules/EmojiPicker/constants';

const ICON_PREFIX = 'ui-icon:';
const MEDIA_REF_PATTERN = /^(local|url|api|unsplash|picker):/;
const DEFAULT_PAGE_EMOJI_IDS = [
  'rocket',
  'idea',
  'package',
  'pin',
  'sparkles',
  'star',
  'palette',
  'tools',
] as const;

const EMOJI_ITEMS_BY_ID = new Map(
  DEFAULT_EMOJI_PICKER_ITEMS.map((item) => [item.id, item] as const),
);
const ICON_ITEMS_BY_ID = new Map(
  DEFAULT_ICON_PICKER_ITEMS.map((item) => [item.id, item] as const),
);

function isPublishedMediaItem(item: MediaItem): boolean {
  return !item.ref.startsWith('local:');
}

function findMediaItemByRef(ref: string): MediaItem | undefined {
  return [
    ...getMediaCollection('svg'),
    ...getMediaCollection('photos'),
    ...getMediaCollection('videos'),
    ...getMediaCollection('other-media'),
    ...getMediaCollection('emojis'),
  ].find((item) => item.ref === ref);
}

function createAssetBoardValue(
  tabId: string,
  itemId: string,
): AssetPickerBoardValue {
  return { tabId, itemId };
}

export function isCollectionMediaRef(value: string): boolean {
  return MEDIA_REF_PATTERN.test(value);
}

export function isCollectionIconRef(value: string): boolean {
  return value.startsWith(ICON_PREFIX);
}

export function getCollectionEmojiValue(id: string, fallback = '✨'): string {
  return EMOJI_ITEMS_BY_ID.get(id)?.value ?? fallback;
}

export function randomUiCollectionEmoji(): string {
  const id =
    DEFAULT_PAGE_EMOJI_IDS[
      Math.floor(Math.random() * DEFAULT_PAGE_EMOJI_IDS.length)
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

export function selectionToCollectionAssetValue(
  selection: AssetPickerBoardSelection,
): string {
  if (selection.tab.id === 'icons') {
    return `${ICON_PREFIX}${selection.item.id}`;
  }

  return selection.item.value;
}

export const COLLECTION_SVG_ITEMS = getMediaCollection('svg').filter(
  isPublishedMediaItem,
);
export const COLLECTION_COVER_ITEMS = getMediaCollection('photos').filter(
  isPublishedMediaItem,
);

export const PAGE_ICON_PICKER_TABS: AssetPickerBoardTab[] = [
  createEmojiPickerTab(DEFAULT_EMOJI_PICKER_ITEMS, {
    label: 'Emoji',
    columns: 6,
  }),
  createMediaCollectionPickerTab('svg', COLLECTION_SVG_ITEMS, {
    label: 'SVG',
    columns: 4,
  }),
  createIconPickerTab(DEFAULT_ICON_PICKER_ITEMS, {
    label: 'Icons',
    columns: 5,
  }),
];

export const COVER_PICKER_TABS: AssetPickerBoardTab[] =
  COLLECTION_COVER_ITEMS.length > 0
    ? [
        createMediaCollectionPickerTab('photos', COLLECTION_COVER_ITEMS, {
          label: 'Photos',
          columns: 2,
        }),
      ]
    : [];

type ResolvedCollectionAsset =
  | {
      kind: 'emoji';
      value: string;
    }
  | {
      kind: 'icon';
      item: IconPickerItem;
    }
  | {
      kind: 'media';
      item?: MediaItem;
      src: string;
    }
  | {
      kind: 'legacy-svg';
      path: string;
    };

export function resolveCollectionAsset(
  value?: string,
): ResolvedCollectionAsset | null {
  if (!value) {
    return null;
  }

  if (isCollectionIconRef(value)) {
    const iconId = value.slice(ICON_PREFIX.length);
    const item = ICON_ITEMS_BY_ID.get(iconId);
    return item ? { kind: 'icon', item } : null;
  }

  if (value.startsWith('svg:')) {
    const path = LEGACY_SVG_ICONS[value.slice(4)];
    return path ? { kind: 'legacy-svg', path } : null;
  }

  if (isCollectionMediaRef(value)) {
    return {
      kind: 'media',
      item: findMediaItemByRef(value),
      src: resolveMediaUrl(value),
    };
  }

  return {
    kind: 'emoji',
    value,
  };
}

export function collectionAssetBoardValue(
  current: string | undefined,
  tabs: AssetPickerBoardTab[],
): AssetPickerBoardValue | undefined {
  if (!current) {
    return undefined;
  }

  if (isCollectionIconRef(current)) {
    const itemId = current.slice(ICON_PREFIX.length);
    return createAssetBoardValue('icons', itemId);
  }

  for (const tab of tabs) {
    const item = tab.items.find((candidate) => candidate.value === current);
    if (item) {
      return createAssetBoardValue(tab.id, item.id);
    }
  }

  return undefined;
}

interface CollectionAssetProps {
  value?: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function CollectionAsset({
  value,
  size = 20,
  className,
  alt = '',
}: Readonly<CollectionAssetProps>) {
  const resolved = resolveCollectionAsset(value);

  if (!resolved) {
    return null;
  }

  if (resolved.kind === 'emoji') {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1 }}
      >
        {resolved.value}
      </span>
    );
  }

  if (resolved.kind === 'icon') {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {renderSizedIcon(resolved.item.icon, size)}
      </span>
    );
  }

  if (resolved.kind === 'media') {
    return (
      <img
        src={resolved.src}
        alt={alt || resolved.item?.label || ''}
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ width: size, height: size, display: 'block' }}
      dangerouslySetInnerHTML={{ __html: resolved.path }}
    />
  );
}

interface CollectionAssetBoardProps {
  current?: string;
  tabs: AssetPickerBoardTab[];
  label: string;
  width?: number | string;
  className?: string;
  showTabs?: boolean;
  showSearch?: boolean;
  onSelect: (value: string) => void;
}

export function CollectionAssetBoard({
  current,
  tabs,
  label,
  width = 352,
  className,
  showTabs,
  showSearch = true,
  onSelect,
}: Readonly<CollectionAssetBoardProps>) {
  return (
    <AssetPickerBoard
      tabs={tabs}
      label={label}
      width={width}
      className={className}
      showTabs={showTabs}
      showSearch={showSearch}
      value={collectionAssetBoardValue(current, tabs)}
      onChangeComplete={(selection) =>
        onSelect(selectionToCollectionAssetValue(selection))
      }
    />
  );
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
  } => SUPPORTED_SLASH_TYPES.has(item.type as BlockType),
);

export const COLLECTION_ROLE_BADGES: Record<string, string> = {
  admin: getCollectionEmojiValue('star'),
  collaborator: getCollectionEmojiValue('palette'),
  member: getCollectionEmojiValue('palette'),
  guest: getCollectionEmojiValue('cool'),
};

export {
  IconBoard,
  IconImage,
  IconPage,
  IconTable,
};
