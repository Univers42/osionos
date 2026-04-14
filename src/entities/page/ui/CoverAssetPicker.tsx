import React from "react";
import { AssetPickerBoard } from "@univers42/ui-collection";

import {
  COVER_PICKER_BOARD_PROPS,
  COVER_PICKER_TABS,
} from "@/shared/lib/markengine/uiCollectionAssets";

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
  if (COVER_PICKER_TABS.length === 0) {
    return null;
  }

  return (
    <div className="notion-cover-picker">
      <AssetPickerBoard
        {...COVER_PICKER_BOARD_PROPS}
        tabs={COVER_PICKER_TABS}
        value={value}
        width="100%"
        label={label}
        onSerializedValueChange={onSelect}
      />
    </div>
  );
};
