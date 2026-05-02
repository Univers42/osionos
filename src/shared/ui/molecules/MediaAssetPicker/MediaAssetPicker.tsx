/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaAssetPicker.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/14 20:35:00 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AssetPickerBoard } from "@univers42/ui-collection";

import type { MediaBlockType } from "@/entities/block";
import {
  IMAGE_PICKER_TABS,
  SLASH_MEDIA_PICKER_BOARD_PROPS,
  getSlashMediaPickerTabs,
} from "@/shared/lib/markengine/uiCollectionAssets";
import { ImageAssetPickerPanel } from "./ImageAssetPickerPanel";

interface MediaAssetPickerProps {
  kind: MediaBlockType;
  value?: string;
  label?: string;
  width?: number | string;
  height?: number | string;
  testId?: string;
  onSelect: (value: string) => void;
}

export const MediaAssetPicker: React.FC<MediaAssetPickerProps> = ({
  kind,
  value,
  label,
  width = "100%",
  height = 332,
  testId = "media-asset-picker",
  onSelect,
}) => {
  const tabs = kind === "image" ? IMAGE_PICKER_TABS : getSlashMediaPickerTabs(kind);

  if (tabs.length === 0) {
    return null;
  }

  if (kind === "image") {
    return (
      <ImageAssetPickerPanel
        testId={testId}
        tabs={tabs}
        value={value}
        label={label}
        width={width}
        height={height}
        boardProps={SLASH_MEDIA_PICKER_BOARD_PROPS}
        onSelect={onSelect}
      />
    );
  }

  return (
    <div
      data-testid={testId}
      data-media-kind={kind}
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{ height }}
    >
      <AssetPickerBoard
        {...SLASH_MEDIA_PICKER_BOARD_PROPS}
        tabs={tabs}
        value={value}
        width={width}
        label={label ?? tabs[0]?.label ?? kind}
        onSerializedValueChange={onSelect}
      />
    </div>
  );
};
