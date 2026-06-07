/**
 * Visual panel: node-size & link-thickness scaling, label density (LOD), glow
 * intensity, and the aurora-background style switcher.
 */

import type { ReactElement } from "react";
import type { BackgroundStyle, Controls } from "../../core/state/controls";
import { Slider } from "./widgets";

const BACKGROUNDS: { id: BackgroundStyle; label: string }[] = [
  { id: "aurora", label: "Aurora" },
  { id: "aurora-calm", label: "Calm" },
  { id: "flat", label: "Flat" },
];

export interface VisualPanelProps {
  controls: Controls;
  update: (mutate: (draft: Controls) => void) => void;
}

export function VisualPanel({ controls, update }: VisualPanelProps): ReactElement {
  const v = controls.visual;
  const set = (key: "nodeScale" | "linkScale" | "labelDensity" | "glow", value: number): void =>
    update((draft) => {
      draft.visual[key] = value;
    });

  return (
    <div className="osio-gc-panel">
      <Slider label="Node size" min={0.4} max={2.5} step={0.05} value={v.nodeScale} onChange={(x) => set("nodeScale", x)} format={(x) => `${x.toFixed(2)}×`} />
      <Slider label="Link thickness" min={0.3} max={3} step={0.05} value={v.linkScale} onChange={(x) => set("linkScale", x)} format={(x) => `${x.toFixed(2)}×`} />
      <Slider label="Label density" min={0} max={1} step={0.05} value={v.labelDensity} onChange={(x) => set("labelDensity", x)} format={(x) => `${Math.round(x * 100)}%`} />
      <Slider label="Glow" min={0} max={1.5} step={0.05} value={v.glow} onChange={(x) => set("glow", x)} format={(x) => `${x.toFixed(2)}`} />

      <h4 className="osio-gc-h">Background</h4>
      <div className="osio-gc-seg">
        {BACKGROUNDS.map((bg) => (
          <button
            key={bg.id}
            type="button"
            className={`osio-gc-seg__btn${v.background === bg.id ? " is-active" : ""}`}
            aria-pressed={v.background === bg.id}
            onClick={() =>
              update((draft) => {
                draft.visual.background = bg.id;
              })
            }
          >
            {bg.label}
          </button>
        ))}
      </div>
    </div>
  );
}
