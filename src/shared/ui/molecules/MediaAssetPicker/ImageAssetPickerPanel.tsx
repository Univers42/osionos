/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ImageAssetPickerPanel.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: Codex <codex@openai.com>                   +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/02 00:00:00 by Codex             #+#    #+#             */
/*   Updated: 2026/05/02 00:00:00 by Codex            ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { AssetPickerBoard, type AssetPickerBoardProps, type AssetPickerBoardTab } from '@univers42/ui-collection';

interface ImageAssetPickerPanelProps {
  tabs: AssetPickerBoardTab[];
  value?: string;
  label?: string;
  width?: number | string;
  height?: number | string;
  testId?: string;
  boardProps?: Partial<AssetPickerBoardProps>;
  onSelect: (value: string) => void;
}

export const ImageAssetPickerPanel: React.FC<ImageAssetPickerPanelProps> = ({
  tabs,
  value,
  label,
  width = '100%',
  height,
  testId = 'image-asset-picker',
  boardProps,
  onSelect,
}) => {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={testId}
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={height ? { height } : undefined}
    >
      <AssetPickerBoard
        {...boardProps}
        tabs={tabs}
        value={value}
        width={width}
        label={label ?? tabs[0]?.label ?? 'Images'}
        onSerializedValueChange={onSelect}
      />
    </div>
  );
};
