import React, { useEffect, useMemo, useState } from 'react';
import {
  AssetPickerBoard,
  resolveAssetValue,
  type AssetPickerBoardProps,
  type AssetPickerBoardTab,
} from '@univers42/ui-collection';
import {
  PAGE_ICON_PICKER_BOARD_PROPS,
  PAGE_ICON_PICKER_TABS,
} from '@/shared/lib/uiCollectionAssets';

type AssetSourceId = string;

interface CompactAssetPickerBoardProps {
  value?: string;
  width?: number | string;
  label?: string;
  onSerializedValueChange?: (value: string) => void;
}

const SOURCE_OPTIONS: ReadonlyArray<{
  id: AssetSourceId;
  label: string;
}> = PAGE_ICON_PICKER_TABS.map((tab) => ({
  id: tab.id,
  label: tab.label,
}));

const SOURCE_IDS = new Set<AssetSourceId>(SOURCE_OPTIONS.map((option) => option.id));
const DEFAULT_SOURCE_ID = SOURCE_OPTIONS[0]?.id ?? 'emojis';
const EMOJI_SOURCE_TAB = PAGE_ICON_PICKER_TABS.find((tab) => tab.id === 'emojis');
const EMOJI_CATEGORY_OPTIONS = (() => {
  if (!EMOJI_SOURCE_TAB) {
    return [];
  }

  const groups = new Map<string, number>();
  for (const item of EMOJI_SOURCE_TAB.items) {
    if (!item.group) {
      continue;
    }
    groups.set(item.group, (groups.get(item.group) ?? 0) + 1);
  }

  const orderedGroupIds = [
    ...(EMOJI_SOURCE_TAB.groupOrder ?? []),
    ...Array.from(groups.keys()),
  ].filter(
    (groupId, index, array) =>
      array.indexOf(groupId) === index && groups.has(groupId),
  );

  return orderedGroupIds.map((groupId) => ({
    id: groupId,
    label: EMOJI_SOURCE_TAB.groupLabels?.[groupId] ?? groupId,
    count: groups.get(groupId) ?? 0,
  }));
})();

function getSourceTab(source: AssetSourceId): AssetPickerBoardTab | undefined {
  return PAGE_ICON_PICKER_TABS.find((tab) => tab.id === source);
}

function resolveInitialSource(value?: string): AssetSourceId {
  const resolvedTabId = value
    ? resolveAssetValue(value, PAGE_ICON_PICKER_TABS)?.tab?.id
    : undefined;

  if (resolvedTabId && SOURCE_IDS.has(resolvedTabId as AssetSourceId)) {
    return resolvedTabId as AssetSourceId;
  }

  return DEFAULT_SOURCE_ID;
}

function resolveInitialEmojiCategory(value?: string): string {
  const resolvedGroup = value
    ? resolveAssetValue(value, PAGE_ICON_PICKER_TABS)?.item?.group
    : undefined;

  if (
    typeof resolvedGroup === 'string' &&
    EMOJI_CATEGORY_OPTIONS.some((category) => category.id === resolvedGroup)
  ) {
    return resolvedGroup;
  }

  return EMOJI_CATEGORY_OPTIONS[0]?.id ?? '';
}

function makeCompactBoardProps(): Partial<AssetPickerBoardProps> {
  return {
    ...PAGE_ICON_PICKER_BOARD_PROPS,
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
        padding: '6px 12px 12px',
      },
      emptyState: {
        ...PAGE_ICON_PICKER_BOARD_PROPS.styles?.emptyState,
        minHeight: 72,
      },
    },
  };
}

const COMPACT_BOARD_PROPS = makeCompactBoardProps();

export const CompactAssetPickerBoard: React.FC<CompactAssetPickerBoardProps> = ({
  value,
  width = '100%',
  label = 'Selector de assets',
  onSerializedValueChange,
}) => {
  const [activeSource, setActiveSource] = useState<AssetSourceId>(() => resolveInitialSource(value));
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>(
    () => resolveInitialEmojiCategory(value),
  );

  useEffect(() => {
    setActiveSource(resolveInitialSource(value));
    setActiveEmojiCategory(resolveInitialEmojiCategory(value));
  }, [value]);

  const boardTabs = useMemo(() => {
    const sourceTab = getSourceTab(activeSource);

    if (!sourceTab) {
      return [];
    }

    if (activeSource !== 'emojis') {
      return [{ ...sourceTab, showGroups: false }];
    }

    const filteredItems = sourceTab.items.filter((item) => item.group === activeEmojiCategory);
    const activeCategory = EMOJI_CATEGORY_OPTIONS.find(
      (category) => category.id === activeEmojiCategory,
    );

    return [
      {
        ...sourceTab,
        label: activeCategory?.label ?? sourceTab.label,
        showGroups: false,
        items: filteredItems.length > 0 ? filteredItems : sourceTab.items,
      },
    ];
  }, [activeEmojiCategory, activeSource]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)]"
      style={{
        width,
        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.16)',
      }}
    >
      <div className="border-b border-[var(--color-line)] px-2 py-2">
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_OPTIONS.map((option) => {
            const isActive = option.id === activeSource;
            return (
              <button
                key={option.id}
                type="button"
                className={[
                  'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-[var(--color-accent)] bg-[rgba(35,131,226,0.12)] text-[var(--color-accent)]'
                    : 'border-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)]',
                ].join(' ')}
                onClick={() => setActiveSource(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {activeSource === 'emojis' && EMOJI_CATEGORY_OPTIONS.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {EMOJI_CATEGORY_OPTIONS.map((category) => {
              const isActive = category.id === activeEmojiCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={[
                    'h-7 rounded-md border px-2.5 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'border-[var(--color-line)] bg-[var(--color-surface-secondary)] text-[var(--color-ink)]'
                      : 'border-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)]',
                  ].join(' ')}
                  onClick={() => setActiveEmojiCategory(category.id)}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AssetPickerBoard
        key={`${activeSource}:${activeEmojiCategory}`}
        {...COMPACT_BOARD_PROPS}
        tabs={boardTabs}
        value={value}
        width="100%"
        label={label}
        onSerializedValueChange={onSerializedValueChange}
      />
    </div>
  );
};
