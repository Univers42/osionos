/**
 * Filters & tag management: toggle node kinds, toggle whole databases (with their
 * legend color + count), and show/hide/recolor individual tag hubs.
 */

import type { ReactElement } from "react";
import type { NodeKind } from "../../core/types";
import type { Controls } from "../../core/state/controls";
import type { Legend } from "../../core/model/legend";
import { shapeOf } from "../../core/render/nodeShape";
import { ShapeGlyph, Toggle } from "./widgets";

const KIND_LABEL: Record<NodeKind, string> = {
  record: "Records",
  note: "Notes",
  database: "Databases",
  tag: "Tags",
};
const TAG_FALLBACK = "#8b93a7";
const MAX_TAGS = 40;

export interface FiltersPanelProps {
  controls: Controls;
  legend: Legend;
  update: (mutate: (draft: Controls) => void) => void;
}

export function FiltersPanel({ controls, legend, update }: FiltersPanelProps): ReactElement {
  const toggle = (list: "hiddenKinds" | "hiddenDatabases" | "hiddenTags", value: string, visible: boolean): void =>
    update((draft) => {
      const arr = draft.filter[list] as string[];
      const next = visible ? arr.filter((v) => v !== value) : [...new Set([...arr, value])];
      (draft.filter[list] as string[]) = next;
    });

  return (
    <div className="osio-gc-panel">
      <h4 className="osio-gc-h">Node kinds</h4>
      {legend.kinds.map((entry) => (
        <Toggle
          key={entry.kind}
          label={KIND_LABEL[entry.kind]}
          glyph={<ShapeGlyph shape={shapeOf(entry.kind)} />}
          count={entry.count}
          checked={!controls.filter.hiddenKinds.includes(entry.kind)}
          onChange={(v) => toggle("hiddenKinds", entry.kind, v)}
        />
      ))}

      {legend.databases.length > 0 && <h4 className="osio-gc-h">Databases</h4>}
      {legend.databases.map((db) => (
        <Toggle
          key={db.id}
          label={db.label}
          color={db.color}
          count={db.count}
          checked={!controls.filter.hiddenDatabases.includes(db.id)}
          onChange={(v) => toggle("hiddenDatabases", db.id, v)}
        />
      ))}

      {legend.tags.length > 0 && <h4 className="osio-gc-h">Tags</h4>}
      {legend.tags.slice(0, MAX_TAGS).map((tag) => (
        <div className="osio-gc-tagrow" key={tag.id}>
          <Toggle
            label={tag.label}
            color={controls.filter.tagColors[tag.label] ?? TAG_FALLBACK}
            count={tag.count}
            checked={!controls.filter.hiddenTags.includes(tag.label)}
            onChange={(v) => toggle("hiddenTags", tag.label, v)}
          />
          <input
            className="osio-gc-color"
            type="color"
            aria-label={`Recolor tag ${tag.label}`}
            value={controls.filter.tagColors[tag.label] ?? TAG_FALLBACK}
            onChange={(e) =>
              update((draft) => {
                draft.filter.tagColors[tag.label] = e.target.value;
              })
            }
          />
        </div>
      ))}
    </div>
  );
}
