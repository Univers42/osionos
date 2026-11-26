import type { Appearance } from "./theme";

export type StyleId = "calm" | "paper" | "soft" | "frost";

export interface StylePreset {
  id: StyleId;
  label: string;
  /** Applied in one updateAppearance call. Never palette, mode or accent. */
  patch: Partial<Appearance>;
}

/** One-click styles over the surface axes and corners, Calm (today's look) first. */
export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: "calm", label: "Calm", patch: { surface: "solid", elevation: "default", borders: "default", radius: "default" } },
  { id: "paper", label: "Paper", patch: { surface: "solid", elevation: "flat", borders: "strong", radius: "sharp" } },
  { id: "soft", label: "Soft", patch: { surface: "solid", elevation: "deep", borders: "none", radius: "round" } },
  { id: "frost", label: "Frost", patch: { surface: "frosted", elevation: "default", borders: "default", radius: "default" } },
];

/** The id of the style whose surface, depth and borders the appearance matches, or null ("Custom"). Corners are applied by a preset but not compared: a later corner tweak keeps the style. Derived, never stored. */
export function activeStyleId(appearance: Appearance): StyleId | null {
  const matches = (patch: Partial<Appearance>) =>
    (Object.keys(patch) as (keyof Appearance)[]).every((key) => key === "radius" || appearance[key] === patch[key]);
  return STYLE_PRESETS.find((preset) => matches(preset.patch))?.id ?? null;
}
