import {
  DEFAULT_EMOJI_PICKER_ITEMS,
  EMOJI_PICKER_GROUPS,
  IconBoard,
  IconImage,
  IconPage,
  IconTable,
  SLASH_ITEMS as PACKAGE_SLASH_ITEMS,
  createDefaultAssetPickerTabs,
  createMediaCollectionPickerTab,
  getMediaCollection,
  type AssetPickerBoardProps,
  type AssetPickerBoardTab,
  type SlashMenuItem as PackageSlashMenuItem,
} from '@univers42/ui-collection';
import type { BlockType } from '@/entities/block';

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
const COLLECTION_SVG_ITEMS = getMediaCollection('svg').filter(
  (item) => !item.ref.startsWith('local:'),
);
const COLLECTION_COVER_ITEMS = getMediaCollection('photos').filter(
  (item) => !item.ref.startsWith('local:'),
);

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
    fontSize: 13,
  },
  groupSection: {
    gap: 8,
    marginBottom: 16,
  },
  groupLabel: {
    padding: '0 4px',
    color: 'var(--color-ink-muted)',
    fontSize: 11,
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
    fontSize: 11,
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
