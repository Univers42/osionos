import React from "react";

import {
  COVER_PICKER_BOARD_PROPS,
  COVER_PICKER_TABS,
} from "@/shared/lib/markengine/uiCollectionAssets";
import { ImageAssetPickerPanel } from "@/shared/ui/molecules/MediaAssetPicker/ImageAssetPickerPanel";

interface CoverAssetPickerProps {
  value?: string;
  label?: string;
  onSelect: (value: string) => void;
}

export const CoverAssetPicker: React.FC<CoverAssetPickerProps> = ({
  value,
  label = "Cover assets",
  onSelect,
}) => {
  return (
    <div className="osionos-cover-picker">
      <ImageAssetPickerPanel
        testId="cover-asset-picker"
        boardProps={COVER_PICKER_BOARD_PROPS}
        tabs={COVER_PICKER_TABS}
        value={value}
        label={label}
        onSelect={onSelect}
      />
    </div>
  );
};
